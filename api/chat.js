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

async function scrapeWebsiteMeta(targetUrl) {
  let url = String(targetUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  
  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch (e) {
    hostname = targetUrl;
  }

  const scraped = {
    url,
    hostname,
    title: hostname.replace(/^www\./, ''),
    description: '',
    siteName: hostname.replace(/^www\./, ''),
    headings: [],
    keywords: [],
    colors: [],
    textSnippet: ''
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DevPatternLabsBot/2.0; +https://devpatternlabs.com)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (resp.ok) {
      const html = await resp.text();
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        scraped.title = titleMatch[1].trim();
      }
      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i) ||
                        html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
      if (descMatch && descMatch[1]) {
        scraped.description = descMatch[1].trim();
      }
      const siteMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);
      if (siteMatch && siteMatch[1]) {
        scraped.siteName = siteMatch[1].trim();
      }
      const hRegex = /<h[1-2][^>]*>([^<]+)<\/h[1-2]>/gi;
      let hMatch;
      while ((hMatch = hRegex.exec(html)) !== null && scraped.headings.length < 8) {
        const text = hMatch[1].replace(/\s+/g, ' ').trim();
        if (text && text.length > 3 && !scraped.headings.includes(text)) {
          scraped.headings.push(text);
        }
      }
      const cleanText = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                            .replace(/<[^>]+>/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim();
      scraped.textSnippet = cleanText.slice(0, 1500);
    }
  } catch (err) {
    console.warn('[WebsiteScraper] Fetch failed, continuing with hostname heuristics:', err.message);
  }

  return scraped;
}

function generateFallbackBrandCalendar(scraped) {
  const brandName = scraped.siteName || scraped.title || scraped.hostname || 'Our Brand';
  const cleanKeyword = (scraped.headings?.[0] || 'growth').replace(/[^a-zA-Z0-9]/g, '');

  const pillars = [
    'Authority & Expertise',
    'Behind the Scenes & Culture',
    'Value & Problem Solving',
    'Community & Engagement'
  ];

  const brandMatrix = {
    brandName,
    tagline: scraped.headings?.[0] || `Empowering modern growth with ${brandName}`,
    voice: 'Authoritative, innovative, engaging, and solution-driven',
    primaryAudience: 'Founders, creators, business leaders, and modern digital consumers',
    contentPillars: pillars,
    recommendedHashtags: [
      `#${brandName.replace(/\s+/g, '')}`,
      `#${cleanKeyword}`,
      '#DigitalGrowth',
      '#Innovation',
      '#BrandBuilding',
      '#DevPatternLabs'
    ],
    suggestedPalette: ['#3b82f6', '#10b981', '#6366f1', '#f59e0b']
  };

  const platforms = ['instagram', 'facebook', 'threads', 'youtube'];
  const times = ['09:00 AM', '11:30 AM', '02:00 PM', '06:30 PM', '08:00 PM'];
  const templates = [
    {
      hook: "Most people overlook this simple strategy for sustainable growth...",
      body: "Here is how we tackle this at " + brandName + ": start with clarity, streamline your workflow, and stay consistent every single day.",
      prompt: "Modern minimalist workspace with neon blue accents, laptop displaying growth metrics, 4k render."
    },
    {
      hook: "Behind the curtain: what actually goes into building our flagship product.",
      body: "Quality isn't accidental. It takes obsessive iteration and listening closely to our community feedback.",
      prompt: "Behind the scenes team working on innovative technology, warm cinematic lighting, photorealistic."
    },
    {
      hook: "Stop wasting hours on manual repetition. Here is the framework we recommend:",
      body: "1. Audit your bottlenecks\n2. Automate the predictable\n3. Focus your energy on high-leverage execution.",
      prompt: "Clean infographic slide showing a 3-step growth framework, sleek dark mode aesthetics."
    },
    {
      hook: "Question for creators and leaders: What was your biggest lesson this quarter?",
      body: "Drop your take below — let's spark a discussion and share what worked vs what we had to pivot away from.",
      prompt: "Engaging graphic with a stylized question mark and vibrant gradient background."
    }
  ];

  const calendar = [];
  for (let day = 1; day <= 30; day++) {
    const pIdx = (day - 1) % pillars.length;
    const tIdx = (day - 1) % templates.length;
    const template = templates[tIdx];
    const platform = platforms[(day - 1) % platforms.length];
    const bestTime = times[(day - 1) % times.length];

    calendar.push({
      day,
      pillar: pillars[pIdx],
      hook: `Day ${day}: ${template.hook}`,
      caption: `${template.hook}\n\n${template.body}\n\nLearn more at ${scraped.url || brandName}.\n\n${brandMatrix.recommendedHashtags.join(' ')}`,
      mediaPrompt: template.prompt,
      recommendedPlatform: platform,
      bestTime
    });
  }

  return { brandMatrix, calendar };
}

async function generateBrandCalendarGemini(scraped, apiKey) {
  const prompt = `Analyze this scraped business website:
URL: ${scraped.url}
Title: ${scraped.title}
Site Name: ${scraped.siteName}
Description: ${scraped.description}
Key Headings: ${scraped.headings.join(' | ')}
Content Snippet: ${scraped.textSnippet}

Task:
1. Formulate a Brand Identity Matrix (Brand Name, Tagline, Brand Voice, Primary Audience, 4 Content Pillars, 6 Recommended Hashtags, 4 Suggested Hex Colors).
2. Generate a full 30-Day Social Media Content Calendar.
   For each day (day 1 to 30):
   - pillar: One of the 4 Content Pillars
   - hook: Attention-grabbing first line
   - caption: Full ready-to-post caption with linebreaks and hashtags
   - mediaPrompt: Creative prompt for an AI image/video or graphic
   - recommendedPlatform: "instagram" | "facebook" | "youtube" | "threads"
   - bestTime: e.g. "09:00 AM", "01:30 PM", "07:00 PM"

You MUST reply with ONLY a single valid JSON object in this format (no markdown code blocks, no wrapping prose):
{
  "brandMatrix": {
    "brandName": "...",
    "tagline": "...",
    "voice": "...",
    "primaryAudience": "...",
    "contentPillars": ["...", "...", "...", "..."],
    "recommendedHashtags": ["#...", "#..."],
    "suggestedPalette": ["#3b82f6", "#10b981", "#6366f1", "#f59e0b"]
  },
  "calendar": [
    {
      "day": 1,
      "pillar": "...",
      "hook": "...",
      "caption": "...",
      "mediaPrompt": "...",
      "recommendedPlatform": "instagram",
      "bestTime": "09:00 AM"
    }
  ]
}`;

  const contents = [{ role: 'user', parts: [{ text: prompt }] }];
  const models = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-flash-latest'];
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 18000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json'
          }
        }),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const cleanJson = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
          const parsed = JSON.parse(cleanJson);
          if (parsed && parsed.brandMatrix && Array.isArray(parsed.calendar) && parsed.calendar.length > 0) {
            return parsed;
          }
        }
      }
    } catch (e) {
      console.warn(`[BrandAudit] Model ${model} failed:`, e.message);
    }
  }
  return null;
}

async function handler(req, res) {
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

    // Handle Brand Audit & 30-Day Content Calendar Generation
    if (data.type === 'brand_audit' || data.action === 'brand_audit') {
      const targetUrl = String(data.url || data.website || '').trim();
      if (!targetUrl) {
        return res.status(400).json({ success: false, error: 'url_required', message: 'Website URL is required.' });
      }

      const scraped = await scrapeWebsiteMeta(targetUrl);
      let auditResult = null;

      if (GEMINI_API_KEY && data.model !== 'free') {
        try {
          auditResult = await generateBrandCalendarGemini(scraped, GEMINI_API_KEY);
        } catch (geminiErr) {
          console.warn('[BrandAudit] Gemini generation failed, using fallback:', geminiErr.message);
        }
      }

      if (!auditResult) {
        auditResult = generateFallbackBrandCalendar(scraped);
      }

      return res.status(200).json({
        success: true,
        scraped,
        brandMatrix: auditResult.brandMatrix,
        calendar: auditResult.calendar
      });
    }
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

module.exports = handler;
module.exports.default = handler;
