import { NextRequest, NextResponse } from "next/server";
import { analyzeVideoWithAI, VideoAnalysisRequest } from "@/lib/ai/video-analysis";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      frames = [],
      prompt = "",
      tone = "professional",
      length = "standard",
      platforms = [],
      filename = "",
      duration = 0,
    } = body;

    const requestPayload: VideoAnalysisRequest = {
      frames: Array.isArray(frames) ? frames : [],
      prompt: typeof prompt === "string" ? prompt.trim() : "",
      tone: tone || "professional",
      length: length || "standard",
      platforms: Array.isArray(platforms) ? platforms : [],
      filename: typeof filename === "string" ? filename : "",
      duration: typeof duration === "number" ? duration : 0,
    };

    const result = await analyzeVideoWithAI(requestPayload);

    return NextResponse.json({
      success: true,
      caption: result.caption,
      title: result.title,
      hashtags: result.hashtags,
      hashtagCategories: result.hashtagCategories,
      videoSummary: result.videoSummary,
      hook: result.hook,
      cta: result.cta,
      modelUsed: result.modelUsed,
    });
  } catch (error: any) {
    console.error("[API /api/ai/caption] Unexpected error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to analyze video and generate captions.",
      },
      { status: 500 }
    );
  }
}
