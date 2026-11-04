import { NextRequest, NextResponse } from "next/server";
import { processScheduledPosts } from "@/lib/scheduler/worker";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Optional Bearer token authorization for cron
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get("authorization");
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized cron caller" }, { status: 401 });
      }
    }

    const result = await processScheduledPosts(10);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    console.error("[Cron Publish Error]", error);
    return NextResponse.json(
      { error: error?.message || "Internal cron error" },
      { status: 500 }
    );
  }
}
