import type { Platform } from "../../types";

export type CaptionTone =
  | "professional"
  | "viral"
  | "educational"
  | "promotional"
  | "storytelling"
  | "minimalist";

export type CaptionLength = "punchy" | "standard" | "detailed";

export interface VideoAnalysisRequest {
  frames?: string[]; // Array of base64 JPEG keyframes
  prompt?: string; // Optional user topic or custom instructions
  tone?: CaptionTone; // Tone of the caption
  length?: CaptionLength; // Length preference
  platforms?: (Platform | string)[]; // Target platforms
  filename?: string;
  duration?: number;
}

export interface VideoAnalysisResult {
  videoSummary: string;
  title: string;
  caption: string;
  hashtags: string[];
  hashtagCategories: {
    trending: string[];
    niche: string[];
    community: string[];
  };
  hook: string;
  cta: string;
  modelUsed?: string;
}

// Order prioritizes fast, high-availability multimodal models
const CANDIDATE_GEMINI_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
];

/**
 * Extracts and cleans hashtags into a sanitized string array.
 */
export function sanitizeHashtags(rawTags: (string | null | undefined)[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of rawTags) {
    if (!raw) continue;
    // Extract words starting with # or words
    const matches = raw.match(/#?[a-zA-Z0-9_]+/g);
    if (matches) {
      for (const match of matches) {
        const tag = match.startsWith("#") ? match : `#${match}`;
        const normalized = tag.toLowerCase();
        if (tag.length > 1 && !seen.has(normalized)) {
          seen.add(normalized);
          result.push(tag);
        }
      }
    }
  }

  return result;
}

/**
 * Toggles a hashtag within a caption string.
 * If present, removes it. If absent, appends it cleanly.
 */
export function toggleHashtagInCaption(caption: string, hashtag: string): string {
  const cleanTag = hashtag.startsWith("#") ? hashtag : `#${hashtag}`;
  const regex = new RegExp(`(^|\\s)${escapeRegex(cleanTag)}(?=\\s|$)`, "gi");

  if (regex.test(caption)) {
    // Remove the tag and clean up duplicate whitespace
    return caption
      .replace(regex, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/ \n/g, "\n")
      .trim();
  } else {
    // Append tag to the end
    const trimmed = caption.trim();
    if (!trimmed) return cleanTag;
    // If the caption ends with hashtags, add space; otherwise add double newline
    const endsWithTag = /#[a-zA-Z0-9_]+$/.test(trimmed);
    if (endsWithTag) {
      return `${trimmed} ${cleanTag}`;
    }
    return `${trimmed}\n\n${cleanTag}`;
  }
}

function escapeRegex(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Formats rich, specific tone instructions for the AI prompt.
 */
function getToneInstructions(tone: CaptionTone = "professional"): string {
  switch (tone) {
    case "viral":
      return `CRITICAL TONE REQUIREMENTS (VIRAL / HOOK):
- GOAL: High-velocity scroll-stopping power, curiosity gaps, comment ignition, and viral sharing.
- OPENING HOOK: Start with an irresistible, high-curiosity hook (e.g. "Wait until you see how this turned out 😱", "Stop scrolling if you want to know the 1 secret...", "Nobody is talking about this:", "Watch till the end 🔥").
- BODY: Punchy, high-energy, relatable, conversational, with expressive emojis.
- CALL TO ACTION: Direct question or challenge prompting comments and saves (e.g. "Drop a 💯 if you agree!", "Tag a friend who needs this!").
- HASHTAGS: High-volume discovery hashtags like #ViralReels, #ShortsViral, #TrendingNow, #FYP, #MustWatch, plus 4-6 specific topic tags.`;

    case "professional":
      return `CRITICAL TONE REQUIREMENTS (PROFESSIONAL):
- GOAL: High authority, industry credibility, business impact, and executive clarity.
- OPENING HOOK: Thought-provoking, articulate statement highlighting strategic value.
- BODY: Polished, well-structured, insightful, corporate elegance, clean formatting.
- CALL TO ACTION: Professional discussion prompt ("How does your team approach this?", "Share your perspective in the comments.").
- HASHTAGS: High-credibility industry tags like #Leadership, #BusinessStrategy, #Innovation, #ProfessionalDevelopment, plus 4-6 specific domain tags.`;

    case "educational":
      return `CRITICAL TONE REQUIREMENTS (EDUCATIONAL / HOW-TO):
- GOAL: Teach the audience actionable steps and practical value from the video.
- OPENING HOOK: Clear promise of learning (e.g. "3 simple steps to master...", "Here is exactly how this works:").
- BODY: Structured takeaways with numbered points or bullet points (Step 1, Step 2, Step 3).
- CALL TO ACTION: Prompt viewers to save for reference ("Bookmark this for later 📌", "Save this post and try it today!").
- HASHTAGS: #HowTo, #Tutorial, #LearnOnSocial, #TipsAndTricks, #KnowledgeSharing, plus specific skill tags.`;

    case "promotional":
      return `CRITICAL TONE REQUIREMENTS (PROMOTIONAL / SALES):
- GOAL: Drive interest, conversion, desire, and immediate viewer action.
- OPENING HOOK: Highlight the transformation, problem solved, or exclusive opportunity.
- BODY: Emphasize key benefits, unique features, and tangible value proposition.
- CALL TO ACTION: Urgent and direct ("Link in bio to get yours today!", "DM us 'START' for access!").
- HASHTAGS: #MustHave, #ExclusiveOffer, #NewRelease, #ShopNow, plus product-specific tags.`;

    case "storytelling":
      return `CRITICAL TONE REQUIREMENTS (STORYTELLING):
- GOAL: Create genuine emotional connection, narrative suspense, and personal resonance.
- OPENING HOOK: Narrative opener (e.g. "I almost gave up until this happened...", "Behind the scenes of what really went down:").
- BODY: Vulnerable, relatable, authentic journey describing the process, struggle, or breakthrough.
- CALL TO ACTION: Meaningful community question ("Have you ever experienced something like this? Tell me below!").
- HASHTAGS: #Storytime, #BehindTheScenes, #MyJourney, #RealLife, #CreatorLife, plus theme tags.`;

    case "minimalist":
      return `CRITICAL TONE REQUIREMENTS (MINIMALIST):
- GOAL: Ultra-sleek, punchy, modern aesthetic with zero fluff.
- OPENING HOOK: Short, sharp 1-liner.
- BODY: Maximum 2 short sentences total. Clean, confident.
- CALL TO ACTION: Subtle 1-line prompt.
- HASHTAGS: 5-8 sleek, essential hashtags (e.g. #minimalist, #focus, #aesthetic, #design).`;

    default:
      return "Tone: Professional, articulate, and engaging.";
  }
}

/**
 * Formats length instructions for the AI prompt.
 */
function getLengthInstructions(length: CaptionLength = "standard"): string {
  switch (length) {
    case "punchy":
      return "Length: Very short and punchy (1-2 sentences + CTA, under 200 characters). Ideal for fast-scrolling mobile feeds like TikTok & Reels.";
    case "detailed":
      return "Length: In-depth and detailed (3-5 comprehensive paragraphs with insights and structured spacing). Ideal for LinkedIn, Facebook, and long-form descriptions.";
    case "standard":
    default:
      return "Length: Balanced (2-3 well-structured paragraphs with hook, body, and CTA, around 300-600 characters).";
  }
}

/**
 * Analyzes video keyframes and generates professional captions, hashtags, and titles using Gemini Vision models.
 */
export async function analyzeVideoWithAI(
  req: VideoAnalysisRequest
): Promise<VideoAnalysisResult> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const tone = req.tone || "professional";
  const length = req.length || "standard";
  const platforms = req.platforms && req.platforms.length > 0 ? req.platforms.join(", ") : "Instagram, YouTube, Facebook";

  // Build the prompt for Gemini
  const promptText = `You are a world-class AI Social Media Director and Video Content Strategist.
Analyze the provided video keyframes extracted in chronological order from the video file.

VIDEO CONTEXT:
- Filename: ${req.filename || "Uploaded Video"}
- Duration: ${req.duration ? `${req.duration} seconds` : "Unknown"}
- Target Platforms: ${platforms}
${getToneInstructions(tone)}
${getLengthInstructions(length)}
${req.prompt ? `- Specific User Focus/Topic: ${req.prompt}` : ""}

TASKS:
1. VISUAL ANALYSIS: Examine the keyframes thoroughly. Describe the scene, subject, actions, mood, setting, and visual cues. Synthesize a 1-2 sentence visual summary in "videoSummary".
2. SOCIAL MEDIA CAPTION: Write a complete, ready-to-post caption strictly adhering to the specified tone requirements.
   - Opening Hook: Catchy, scroll-stopping first sentence matching the tone.
   - Body: High-value explanation or storytelling based on what actually appears in the video.
   - Call To Action (CTA): Clear closing question or directive encouraging comments, saves, or shares.
   - Include 1-3 tasteful emojis suited to the tone.
   - DO NOT append a block of hashtags inside the "caption" text; put the hashtags in the "hashtags" array.
3. HASHTAGS: Generate 8-15 high-performing, relevant hashtags based on the actual visual content, tone, and target platforms.
   - Categorize them into "trending" (broad reach), "niche" (specific topic seen in video), and "community" (target audience).
   - Ensure every hashtag starts with '#'.
4. VIDEO / YOUTUBE TITLE: Provide a high-CTR, SEO-optimized title under 90 characters that accurately reflects the video content and tone.

RESPONSE FORMAT:
You MUST respond with STRICT JSON conforming to this schema (do NOT include markdown code blocks):
{
  "videoSummary": "1-2 sentence description of what visually appears in the video",
  "title": "Optimized video title under 90 characters",
  "caption": "Polished caption text with hook, body, and CTA",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#tag6", "#tag7", "#tag8"],
  "hashtagCategories": {
    "trending": ["#tag1", "#tag2"],
    "niche": ["#tag3", "#tag4", "#tag5"],
    "community": ["#tag6", "#tag7", "#tag8"]
  },
  "hook": "The opening hook line",
  "cta": "The closing call-to-action line"
}`;

  if (geminiApiKey) {
    // Attempt with candidate models in fallback order
    for (const model of CANDIDATE_GEMINI_MODELS) {
      try {
        const parts: any[] = [];

        // Add frames if provided
        if (req.frames && req.frames.length > 0) {
          for (const b64 of req.frames) {
            // Strip data:image/...;base64, prefix if present
            const cleanB64 = b64.includes(",") ? b64.split(",")[1] : b64;
            parts.push({
              inline_data: {
                mime_type: "image/jpeg",
                data: cleanB64,
              },
            });
          }
        }

        parts.push({ text: promptText });

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: {
                response_mime_type: "application/json",
                temperature: 0.75,
              },
            }),
            signal: AbortSignal.timeout(9000), // 9-second timeout to failover fast if model lags
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          console.warn(`[VideoAnalysis] Model ${model} returned ${response.status}: ${errText.slice(0, 100)}`);
          continue; // Try next model in candidate list
        }

        const data = await response.json();
        const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!rawContent) {
          console.warn(`[VideoAnalysis] Model ${model} returned empty content.`);
          continue;
        }

        // Clean any markdown code blocks if the model wrapped it
        const cleaned = rawContent
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();

        let parsed: any;
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          const firstBrace = cleaned.indexOf("{");
          const lastBrace = cleaned.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1) {
            parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
          } else {
            continue;
          }
        }

        // Handle if model returned an array of objects [ { ... } ]
        const resObj = Array.isArray(parsed) ? parsed[0] : parsed;
        if (!resObj) continue;

        const rawTags = resObj.hashtags || resObj.Hashtags || resObj.tags || [];
        const tagsList = Array.isArray(rawTags)
          ? rawTags
          : typeof rawTags === "string"
          ? rawTags.split(/\s+/)
          : [];

        const sanitizedHashtags = sanitizeHashtags(tagsList);
        const sanitizedTrending = sanitizeHashtags(resObj.hashtagCategories?.trending || []);
        const sanitizedNiche = sanitizeHashtags(resObj.hashtagCategories?.niche || []);
        const sanitizedCommunity = sanitizeHashtags(resObj.hashtagCategories?.community || []);

        const finalCaption = resObj.caption || resObj.Caption || "";
        const finalTitle = (resObj.title || resObj.Title || req.filename || "New Video").slice(0, 95);
        const finalSummary = resObj.videoSummary || resObj.VideoSummary || resObj.summary || "AI analyzed the visual keyframes from this video.";

        return {
          videoSummary: finalSummary,
          title: finalTitle,
          caption: finalCaption,
          hashtags: sanitizedHashtags.length > 0 ? sanitizedHashtags : getDefaultHashtagsForTone(tone),
          hashtagCategories: {
            trending: sanitizedTrending.length > 0 ? sanitizedTrending : sanitizedHashtags.slice(0, 3),
            niche: sanitizedNiche.length > 0 ? sanitizedNiche : sanitizedHashtags.slice(3, 7),
            community: sanitizedCommunity.length > 0 ? sanitizedCommunity : sanitizedHashtags.slice(7),
          },
          hook: resObj.hook || "",
          cta: resObj.cta || "",
          modelUsed: model,
        };
      } catch (err: any) {
        console.warn(`[VideoAnalysis] Error with model ${model}:`, err.message);
      }
    }
  }

  // Graceful heuristic fallback if API key is not configured or all Gemini calls failed
  return generateHeuristicFallback(req);
}

function getDefaultHashtagsForTone(tone: CaptionTone): string[] {
  switch (tone) {
    case "viral":
      return ["#viral", "#trending", "#ViralReels", "#ShortsViral", "#TrendingNow", "#FYP", "#MustWatch", "#ExplorePage"];
    case "professional":
      return ["#Leadership", "#BusinessStrategy", "#Innovation", "#ProfessionalGrowth", "#IndustryInsights"];
    case "educational":
      return ["#HowTo", "#Tutorial", "#LearnOnSocial", "#TipsAndTricks", "#KnowledgeSharing", "#Education"];
    case "promotional":
      return ["#SpecialOffer", "#NewRelease", "#MustHave", "#Exclusive", "#TrendingProduct"];
    case "storytelling":
      return ["#Storytime", "#BehindTheScenes", "#MyJourney", "#CreatorLife", "#RealTalk"];
    case "minimalist":
      return ["#minimalist", "#focus", "#aesthetic", "#simplicity"];
    default:
      return ["#trending", "#viral", "#reels", "#shorts"];
  }
}

/**
 * Intelligent heuristic fallback generator.
 * Produces realistic, tone-accurate copy and tags.
 */
function generateHeuristicFallback(req: VideoAnalysisRequest): VideoAnalysisResult {
  const tone = req.tone || "professional";
  const nameBase = (req.filename || "Video")
    .replace(/\.[^/.]+$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const promptTopic = req.prompt?.trim() || nameBase;

  let caption = "";
  let hook = "";
  let cta = "";
  let title = `${nameBase}`;

  if (tone === "viral") {
    hook = `Wait until you see how this turned out! 😱🔥`;
    caption = `${hook}\n\nThis is the one thing nobody is talking about right now. Watch till the end to see the full breakdown!`;
    cta = `Drop a 💯 below if you agree! Tag a friend who needs to see this. 👇`;
    title = `Stop Scrolling: You Need to See This! 🚀`;
  } else if (tone === "educational") {
    hook = `3 essential takeaways you should know about this:`;
    caption = `${hook}\n\n1️⃣ Key Foundation: Master the basics first\n2️⃣ Intentional Action: Focus on consistency over speed\n3️⃣ Continuous Feedback: Iterate based on real results\n\nBookmark this post for your next review! 📌`;
    cta = `Which of these 3 steps is your favorite? Let us know below!`;
    title = `How to Master This (Step-by-Step Guide)`;
  } else if (tone === "promotional") {
    hook = `Ready to elevate your results? Here's what makes the difference. ✨`;
    caption = `${hook}\n\nDesigned for maximum impact and seamless execution. Don't wait to upgrade your workflow—start experiencing real value today.`;
    cta = `Click the link in our bio to learn more and get started! 🚀`;
    title = `Exclusive Reveal: The Next-Level Solution`;
  } else if (tone === "storytelling") {
    hook = `I never expected this journey to unfold quite like this... 🎬`;
    caption = `${hook}\n\nBehind every successful milestone is dedication, trial, and countless unseen hours. Here is an authentic glimpse into the process from start to finish.`;
    cta = `Have you ever experienced a journey like this? Share your story below! 👇`;
    title = `The Untold Journey: Behind the Scenes`;
  } else if (tone === "minimalist") {
    hook = `Precision. Focus. Execution.`;
    caption = `${hook}\n\nStripping away the noise to focus on what actually matters.`;
    cta = `Less is more.`;
    title = `Clarity in Focus`;
  } else {
    // Professional default
    hook = `Strategic insight: Elevating execution and measurable impact.`;
    caption = `${hook}\n\nIn this video, we examine practical methodologies designed to optimize workflows, enhance consistency, and deliver tangible results.\n\nKey Focus Areas:\n• Proven frameworks\n• Measurable outcomes\n• Sustainable growth`;
    cta = `How does your team navigate this approach? Let's connect in the comments below. 👇`;
    title = `Strategic Insights: Driving Measurable Results`;
  }

  const finalCaption = `${caption}\n\n${cta}`;
  const allTags = sanitizeHashtags(getDefaultHashtagsForTone(tone));

  return {
    videoSummary: `Visual breakdown centered on "${promptTopic}" (${req.duration ? `${req.duration}s` : "video content"}).`,
    title: title.slice(0, 95),
    caption: finalCaption,
    hashtags: allTags,
    hashtagCategories: {
      trending: allTags.slice(0, 3),
      niche: allTags.slice(3, 6),
      community: allTags.slice(6),
    },
    hook,
    cta,
    modelUsed: "heuristic-fallback",
  };
}
