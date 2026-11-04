import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import {
  getConnectedYouTubeAccount,
  getValidYouTubeAccessToken,
  forceRefreshYouTubeAccessToken,
} from "@/lib/oauth/youtube-service";
import { publishToYouTube } from "@/lib/platforms/youtube";
import { verifyYouTubeUploadScope } from "@/lib/oauth/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB limit
const ALLOWED_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/webm",
  "video/x-matroska",
  "video/avi",
  "video/x-msvideo",
];

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    console.log("[YouTube Upload] Connected user found:", user ? "yes" : "no");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    // Accept either 'video' or 'file' field
    const file = (formData.get("video") || formData.get("file")) as File | null;
    const title = (formData.get("title") as string) || "";
    const description = (formData.get("description") as string) || "";
    const rawTags = (formData.get("tags") as string) || "";
    const privacyStatus =
      (formData.get("privacyStatus") as "public" | "unlisted" | "private") || "public";
    const scheduledAt = (formData.get("scheduledAt") as string) || null;

    console.log("[YouTube Upload] File received:", file ? "yes" : "no");
    if (!file) {
      return NextResponse.json(
        { error: "No video file was uploaded. Please select a video file." },
        { status: 400 }
      );
    }

    console.log(`[YouTube Upload] File name: ${file.name}`);
    console.log(`[YouTube Upload] MIME type: ${file.type || "unknown"}`);
    console.log(`[YouTube Upload] File size: ${file.size} bytes (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);

    if (!title.trim()) {
      return NextResponse.json(
        { error: "Please enter a title for your YouTube video." },
        { status: 400 }
      );
    }

    const mimeType = file.type || "video/mp4";
    const isAllowedType =
      ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase()) ||
      file.name.match(/\.(mp4|mov|webm|mkv|avi|m4v)$/i);

    if (!isAllowedType) {
      return NextResponse.json(
        {
          error:
            "Invalid video format. Supported formats include MP4, MOV, WebM, and MKV.",
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Video file size exceeds the 500 MB limit." },
        { status: 400 }
      );
    }

    // Verify user has connected YouTube account
    const connData = await getConnectedYouTubeAccount(user.id);
    if (!connData) {
      console.warn(`[YouTube Upload] No YouTube channel connected for user: ${user.id}`);
      return NextResponse.json(
        { error: "No YouTube channel connected. Please click 'Connect YouTube' first." },
        { status: 400 }
      );
    }

    const { connection, account } = connData;
    const channelTitle = connection.youtubeChannelName || account.account_name || "YouTube Channel";
    const hasRefreshToken = !!connection.refreshToken;
    console.log(`[YouTube Upload] Channel: ${channelTitle} (${connection.youtubeChannelId})`);
    console.log("[YouTube Upload] Refresh token available:", hasRefreshToken ? "yes" : "no");

    // Retrieve active access token (auto-refreshes if expired)
    let accessToken: string;
    let tokenRefreshAttempted = false;
    let tokenRefreshResult: "success" | "failed" | "not_needed" = "not_needed";

    try {
      const expiresAtMs = connection.accessTokenExpiresAt
        ? new Date(connection.accessTokenExpiresAt).getTime()
        : 0;
      const isExpired = expiresAtMs === 0 || Date.now() + 5 * 60 * 1000 > expiresAtMs;

      if (isExpired && hasRefreshToken) {
        tokenRefreshAttempted = true;
        console.log("[YouTube Upload] Token refresh attempted: yes");
        const refreshed = await forceRefreshYouTubeAccessToken(user.id);
        accessToken = refreshed.accessToken;
        tokenRefreshResult = "success";
        console.log("[YouTube Upload] Token refresh result: success");
      } else {
        accessToken = await getValidYouTubeAccessToken(user.id);
      }
    } catch (tokenErr: any) {
      console.error("[YouTube Upload] Token refresh result: failed", tokenErr);
      return NextResponse.json(
        {
          error:
            tokenErr?.message ||
            "Your YouTube connection has expired. Please reconnect your account.",
        },
        { status: 400 }
      );
    }

    // Verify granted scopes
    const scopeCheck = await verifyYouTubeUploadScope(accessToken);
    console.log("[YouTube Upload] youtube.upload scope available:", scopeCheck.hasScope ? "yes" : "no");

    if (!scopeCheck.hasScope) {
      console.error("[YouTube Upload] Insufficient scope: youtube.upload is missing.");
      return NextResponse.json(
        {
          error: "YouTube upload permission is missing. Please reconnect YouTube.",
          devDetails: {
            status: 403,
            reason: "insufficientPermissions",
            message:
              "The https://www.googleapis.com/auth/youtube.upload scope was not granted. Please reconnect your YouTube account.",
          },
        },
        { status: 403 }
      );
    }

    // Parse tags
    let parsedTags: string[] = [];
    if (rawTags) {
      parsedTags = rawTags
        .split(",")
        .map((t) => t.trim().replace(/^#/, ""))
        .filter((t) => t.length > 0);
    }

    // Real YouTube Data API v3 upload - called EXACTLY ONCE per user action
    console.log("[YouTube Upload] videos.insert request started (single call policy)");
    const arrayBuffer = await file.arrayBuffer();
    const videoBuffer = Buffer.from(arrayBuffer);

    const result = await publishToYouTube({
      userId: user.id,
      accessToken,
      videoBuffer,
      title,
      description,
      tags: parsedTags,
      privacyStatus,
      publishAt: scheduledAt,
      mimeType,
    });

    if (!result.success) {
      const httpStatus =
        result.devDetails?.status &&
        result.devDetails.status >= 400 &&
        result.devDetails.status < 600
          ? result.devDetails.status
          : result.errorCode === "uploadLimitExceeded" || result.errorCode === "quotaExceeded"
          ? 429
          : 400;

      console.error("[YouTube Upload] YouTube upload failed with code:", result.errorCode);
      console.error("[YouTube Upload] YouTube upload error message:", result.errorMessage);

      // If uploadLimitExceeded: YouTube account remains connected, mark only this upload failed
      if (result.errorCode === "uploadLimitExceeded") {
        console.log(
          `[YouTube Upload] Channel ${channelTitle} reached 24h upload limit. Keeping account connected.`
        );
      }

      return NextResponse.json(
        {
          error: result.errorMessage,
          errorCode: result.errorCode,
          devDetails: result.devDetails || {
            status: httpStatus,
            reason: result.errorCode || "UPLOAD_FAILED",
            message: result.errorMessage,
          },
        },
        { status: httpStatus }
      );
    }

    // Validate that real video ID exists and is not fake
    const realVideoId = result.platformPostId;
    if (!realVideoId || typeof realVideoId !== "string" || realVideoId.trim() === "" || realVideoId.startsWith("mock_")) {
      console.error("[YouTube Upload] Error: No real YouTube video ID returned by YouTube Data API v3.");
      return NextResponse.json(
        {
          error: "Upload failed: No real video ID was returned by YouTube Data API v3.",
          devDetails: {
            status: 500,
            reason: "NO_REAL_VIDEO_ID",
            message: "YouTube Data API did not return a valid video ID in response.data.id",
          },
        },
        { status: 500 }
      );
    }

    const realVideoUrl = `https://www.youtube.com/watch?v=${realVideoId}`;

    return NextResponse.json({
      success: true,
      videoId: realVideoId,
      url: realVideoUrl,
      videoUrl: realVideoUrl,
      channelTitle,
      status: scheduledAt ? "scheduled" : (result.isProcessing ? "processing" : "uploaded"),
      message:
        result.processingMessage ||
        (result.isProcessing
          ? "Uploaded successfully — YouTube is processing the video."
          : "Video published successfully to YouTube!"),
      isProcessing: !!result.isProcessing,
      scheduledAt,
    });
  } catch (error: any) {
    console.error("[YouTube Direct Upload Route Exception]:", error);
    return NextResponse.json(
      {
        error: error?.message || "An unexpected error occurred during YouTube upload.",
        devDetails: {
          status: 500,
          reason: "SERVER_EXCEPTION",
          message: error?.message || "Internal server error",
        },
      },
      { status: 500 }
    );
  }
}
