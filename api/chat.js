const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || '').trim();
const FAST_RACE_MODELS = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest'];
const BACKUP_MODELS = ['gemini-3.5-flash', 'gemini-flash-latest'];

// In-memory rate limiting map for chat API abuse prevention (PS-16)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 20;

function checkChatRateLimit(identifier) {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimitMap.set(identifier, entry);
    return true;
  }
  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  entry.count += 1;
  rateLimitMap.set(identifier, entry);
  return true;
}

const SYSTEM_PROMPT_TEXT = `You are a natural, friendly AI assistant inside a website.

Your behavior should feel like a normal ChatGPT conversation.

Rules:
- Reply naturally and directly to what the user says.
- Do not act like a marketing assistant unless the user specifically asks about marketing.
- Do not automatically suggest creating posts, videos, posters, campaigns, reels, or ads.
- Do not add action buttons or button-like text inside your response.
- Do not include text such as:
  "Send to Create Post"
  "Copy"
  "Make Video"
  "Make Poster"
  unless the user specifically asks for those actions.
- Do not make every reply long.
- For simple greetings, reply simply.

Examples:
User: hi
Assistant: Hey! 👋 How can I help you?

User: hello
Assistant: Hey! What can I help you with?

User: how are you
Assistant: I'm doing good! How can I help?

User: what is seo
Assistant: SEO stands for Search Engine Optimization. It helps improve a website's visibility on search engines like Google.

User: create a caption for my business
Assistant: Sure. Tell me what the post is about, and I'll create a caption for you.

User: enna panra
Assistant: Unakku help panna ready-ah iruken 😄 Sollu, enna venum?

User: website create pannanum
Assistant: Sure. Enna type website create pannanum? Business website, portfolio, e-commerce, illa vera type-a?

Conversation style:
- Match the user's tone and language.
- If they use English, respond in English.
- If they use Tamil + English, respond naturally in Tanglish.
- Keep greetings short.
- Use emojis only occasionally.
- Avoid excessive enthusiasm.
- Avoid phrases like "Great to connect with you!" unless it genuinely fits.
- Avoid unnecessary follow-up questions.
- Give detailed answers only when the user's request needs detail.
- Never repeat the same marketing suggestions after every response.

Important:
The chatbot response should contain only the conversational answer.
Any website buttons such as Copy, Create Post, Make Video, Make Poster, Regenerate, or Share must be handled separately by the frontend UI and must NOT be generated as part of the AI message.`;

function sanitizeAiReply(text) {
  if (!text) return '';
  return text
    .replace(/(?:🚀|🎬|🎨|📋)?\s*(?:Send to Create Post|Make Video|Make Poster|Copy|Regenerate)\s*$/gim, '')
    .trim();
}

async function fetchGeminiModel(model, contents, systemText, apiKey, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemText }]
        },
        contents,
        generationConfig: {
          maxOutputTokens: 600,
          temperature: 0.7
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const errMsg = errJson.error?.message || `HTTP ${response.status}`;
      throw new Error(`Model ${model} returned ${response.status}: ${errMsg}`);
    }

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (reply && reply.trim()) {
      return { reply: sanitizeAiReply(reply), modelUsed: model };
    }
    throw new Error(`Model ${model} returned empty content`);
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(userMessages, systemText, apiKey) {
  const contents = [];
  for (const m of userMessages) {
    if (!m || !m.content) continue;
    const role = (m.role === 'assistant' || m.role === 'model') ? 'model' : 'user';
    contents.push({
      role,
      parts: [{ text: m.content }]
    });
  }

  if (contents.length === 0) {
    contents.push({
      role: 'user',
      parts: [{ text: 'Hello Mint!' }]
    });
  }

  // 1. Race the fastest flash-lite models concurrently for ~1s reply speed
  try {
    return await Promise.any(
      FAST_RACE_MODELS.map(model => fetchGeminiModel(model, contents, systemText, apiKey, 5000))
    );
  } catch (raceErr) {
    console.warn('[GeminiChat] Fast race failed, falling back to backup models:', raceErr.message);
  }

  // 2. Sequential fallback to standard flash models if lite models throttle
  for (const model of BACKUP_MODELS) {
    try {
      return await fetchGeminiModel(model, contents, systemText, apiKey, 6000);
    } catch (backupErr) {
      console.warn(`[GeminiChat] Backup model ${model} failed:`, backupErr.message);
    }
  }

  throw new Error('All Gemini candidate models failed to respond.');
}

async function callPollinations(userMessages, systemText) {
  const fullMessages = [
    { role: 'system', content: systemText },
    ...userMessages.map(m => ({ role: m.role, content: m.content }))
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const aiRes = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: fullMessages,
        model: 'openai',
        seed: Math.floor(Math.random() * 1000000)
      }),
      signal: controller.signal
    });

    if (!aiRes.ok) {
      throw new Error('AI upstream status ' + aiRes.status);
    }

    const reply = await aiRes.text();
    return { reply: sanitizeAiReply(reply), modelUsed: 'pollinations' };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  // Rate Limiting (PS-16)
  const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown_client';
  if (!checkChatRateLimit(clientIp)) {
    return res.status(429).json({
      success: false,
      error: 'rate_limited',
      message: 'Too many chat requests. Please wait a minute before sending more messages.'
    });
  }

  try {
    const data = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    let userMessages = Array.isArray(data.messages) ? data.messages : [];
    
    // Bounds checking
    if (userMessages.length > 20) {
      userMessages = userMessages.slice(-20);
    }
    userMessages = userMessages.map(m => ({
      role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
      content: String(m.content || '').slice(0, 1500)
    }));

    const modelPreference = data.model || 'gemini';

    let result = null;
    if (modelPreference === 'free' || !GEMINI_API_KEY) {
      try {
        result = await callPollinations(userMessages, SYSTEM_PROMPT_TEXT);
      } catch (err) {
        if (GEMINI_API_KEY) {
          result = await callGemini(userMessages, SYSTEM_PROMPT_TEXT, GEMINI_API_KEY);
        } else {
          result = {
            reply: 'Hello! I am Zoya AI. How can I help you today with your social media content?',
            modelUsed: 'local_fallback'
          };
        }
      }
    } else {
      // Default to Gemini Flash (Google AI)
      try {
        result = await callGemini(userMessages, SYSTEM_PROMPT_TEXT, GEMINI_API_KEY);
      } catch (err) {
        console.warn('Gemini failed, falling back to Pollinations:', err.message);
        try {
          result = await callPollinations(userMessages, SYSTEM_PROMPT_TEXT);
        } catch (pollErr) {
          result = {
            reply: 'Hello! I am Zoya AI. I am temporarily experiencing high traffic, but I am here to help you create great social content.',
            modelUsed: 'local_fallback'
          };
        }
      }
    }

    return res.status(200).json({ success: true, reply: result.reply, modelUsed: result.modelUsed });
  } catch (err) {
    console.error('AI chat endpoint error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
