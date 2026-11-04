import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ success: false, error: "Invalid site URL" }, { status: 400 });
    }

    const targetUrl = url.trim();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
      const res = await fetch(targetUrl, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      return NextResponse.json({
        success: true,
        status: res.status,
        statusText: res.statusText,
        url: targetUrl,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      return NextResponse.json({
        success: false,
        error: fetchErr?.name === "AbortError" ? "Connection timed out after 4 seconds" : fetchErr?.message || "Failed to reach site",
      });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Ping error" }, { status: 500 });
  }
}
