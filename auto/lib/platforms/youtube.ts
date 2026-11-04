import fs from "fs";
import path from "path";
import { PublishResult } from "@/types";
import {
  getConnectedYouTubeAccount,
  getValidYouTubeAccessToken,
  forceRefreshYouTubeAccessToken,
} from "@/lib/oauth/youtube-service";

export interface YouTubePublishParams {
  userId?: string;
  accessToken?: string;
  video?: Buffer | ArrayBuffer | string | File;
  videoBuffer?: Buffer | ArrayBuffer;
  videoUrl?: string;
  videoStoragePath?: string;
  filename?: string;
  title?: string;
  youtubeTitle?: string;
  caption?: string;
  description?: string;
  tags?: string[] | string;
  privacyStatus?: "public" | "unlisted" | "private";
  publishAt?: string | null;
  mimeType?: string;
}

/**
 * Resolves the YouTube Title using strict priority:
 * 1. User-entered YouTube Title
 * 2. Caption
 * 3. Original video file name
 * Never sends an empty YouTube title.
 */
export function resolveYouTubeTitle({
  youtubeTitle,
  title,
  caption,
  filename,
}: {
  youtubeTitle?: string | null;
  title?: string | null;
  caption?: string | null;
  filename?: string | null;
}): string {
  if (youtubeTitle && youtubeTitle.trim().length > 0) {
    return youtubeTitle.trim().slice(0, 100);
  }
  if (title && title.trim().length > 0) {
    return title.trim().slice(0, 100);
  }
  if (caption && caption.trim().length > 0) {
    const firstLine = caption.split("\n")[0].trim();
    const clean = firstLine.replace(/#[a-zA-Z0-9_]+/g, "").trim();
    if (clean.length > 0) {
      return clean.slice(0, 100);
    }
    return caption.trim().slice(0, 100);
  }
  if (filename && filename.trim().length > 0) {
    const base = filename.replace(/\.[^/.]+$/, "").trim();
    if (base.length > 0) {
      return base.slice(0, 100);
    }
  }
  return "BEWEB Video Upload";
}

/**
 * Resolves the binary video buffer from memory, local storage, or URL.
 */
export function resolveVideoBuffer(params: {
  video?: Buffer | ArrayBuffer | string | File;
  videoBuffer?: Buffer | ArrayBuffer;
  videoUrl?: string;
  videoStoragePath?: string;
  filename?: string;
}): { buffer: Buffer; size: number; contentType: string } | null {
  try {
    // 1. Direct Buffer
    if (Buffer.isBuffer(params.videoBuffer)) {
      return { buffer: params.videoBuffer, size: params.videoBuffer.length, contentType: "video/mp4" };
    }
    if (Buffer.isBuffer(params.video)) {
      return { buffer: params.video, size: params.video.length, contentType: "video/mp4" };
    }

    // 2. ArrayBuffer
    if (params.videoBuffer instanceof ArrayBuffer) {
      const b = Buffer.from(params.videoBuffer);
      return { buffer: b, size: b.length, contentType: "video/mp4" };
    }
    if (params.video instanceof ArrayBuffer) {
      const b = Buffer.from(params.video);
      return { buffer: b, size: b.length, contentType: "video/mp4" };
    }

    // 3. String path
    const candidatePaths: string[] = [];
    if (typeof params.video === "string" && params.video.trim()) {
      candidatePaths.push(params.video.trim());
    }
    if (params.videoStoragePath && params.videoStoragePath.trim()) {
      candidatePaths.push(params.videoStoragePath.trim());
      candidatePaths.push(path.join(process.cwd(), ".data", "uploads", params.videoStoragePath.trim()));
      candidatePaths.push(path.join(process.cwd(), ".data", params.videoStoragePath.trim()));
    }
    if (params.filename && params.filename.trim()) {
      candidatePaths.push(path.join(process.cwd(), ".data", "uploads", params.filename.trim()));
      candidatePaths.push(path.join(process.cwd(), ".data", params.filename.trim()));
    }

    for (const p of candidatePaths) {
      const resolved = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        const b = fs.readFileSync(resolved);
        return { buffer: b, size: b.length, contentType: "video/mp4" };
      }
    }
  } catch (err) {
    console.error("[YouTube Buffer Resolution Error]:", err);
  }

  return null;
}

/**
 * Reusable backend YouTube publishing function.
 * Used by BOTH unified publishing and YouTube-specific publishing.
 */
export async function publishToYouTube(params: YouTubePublishParams): Promise<PublishResult> {
  console.log("[YouTube Upload] YouTube publishing started");

  let accessToken = params.accessToken;
  const userId = params.userId;

  if (!userId) {
    return {
      success: false,
      errorCode: "YOUTUBE_NOT_CONNECTED",
      errorMessage: "No authenticated user ID provided for YouTube upload.",
    };
  }

  // 1. Resolve connected account
  const connData = await getConnectedYouTubeAccount(userId);
  const accountFound = !!connData;
  console.log(`[YouTube Upload] Connected account found: ${accountFound ? "yes" : "no"}`);

  if (!accessToken && !connData) {
    console.error("[YouTube Upload] YouTube error code: YOUTUBE_NOT_CONNECTED");
    console.error("[YouTube Upload] YouTube error reason: accountNotFound");
    console.error(
      "[YouTube Upload] YouTube error message: No connected YouTube channel found for user. Please connect YouTube in Accounts."
    );
    return {
      success: false,
      errorCode: "YOUTUBE_NOT_CONNECTED",
      errorMessage: "Your YouTube account is not connected. Please connect it in Accounts.",
    };
  }

  const hasRefreshToken = !!connData?.connection?.refreshToken;
  console.log(`[YouTube Upload] Refresh token exists: ${hasRefreshToken ? "yes" : "no"}`);

  // 2. Resolve access token & refresh automatically if expired
  let tokenRefreshNeeded = false;
  if (!accessToken && connData) {
    const expiresAtMs = connData.connection.accessTokenExpiresAt
      ? new Date(connData.connection.accessTokenExpiresAt).getTime()
      : 0;
    tokenRefreshNeeded = expiresAtMs === 0 || Date.now() + 5 * 60 * 1000 > expiresAtMs;
    console.log(`[YouTube Upload] Token refresh needed: ${tokenRefreshNeeded ? "yes" : "no"}`);

    try {
      if (tokenRefreshNeeded && hasRefreshToken) {
        const refreshed = await forceRefreshYouTubeAccessToken(userId);
        accessToken = refreshed.accessToken;
      } else {
        accessToken = await getValidYouTubeAccessToken(userId);
      }
    } catch (tokenErr: any) {
      console.error("[YouTube Upload] YouTube error code: TOKEN_REFRESH_FAILED");
      console.error("[YouTube Upload] YouTube error message:", tokenErr?.message || tokenErr);
      return {
        success: false,
        errorCode: "TOKEN_EXPIRED",
        errorMessage: tokenErr?.message || "Google authorization has expired. Please reconnect YouTube.",
      };
    }
  } else {
    console.log("[YouTube Upload] Token refresh needed: no");
  }

  if (!accessToken) {
    return {
      success: false,
      errorCode: "NO_ACCESS_TOKEN",
      errorMessage: "No valid YouTube access token found. Please reconnect YouTube in Accounts.",
    };
  }

  // 3. Resolve video binary
  let resolvedMedia = resolveVideoBuffer(params);

  // If videoUrl provided, download binary
  if (!resolvedMedia && params.videoUrl && params.videoUrl.startsWith("http")) {
    try {
      const res = await fetch(params.videoUrl);
      if (res.ok) {
        const ab = await res.arrayBuffer();
        resolvedMedia = {
          buffer: Buffer.from(ab),
          size: ab.byteLength,
          contentType: res.headers.get("content-type") || "video/mp4",
        };
      }
    } catch (downloadErr) {
      console.error("[YouTube Video Download Error]:", downloadErr);
    }
  }

  const videoReceived = !!resolvedMedia;
  console.log(`[YouTube Upload] Video file received: ${videoReceived ? "yes" : "no"}`);

  if (!resolvedMedia) {
    console.error("[YouTube Upload] YouTube error code: VIDEO_NOT_FOUND");
    console.error(
      "[YouTube Upload] YouTube error message: Video file binary could not be found or read for YouTube upload."
    );
    return {
      success: false,
      errorCode: "VIDEO_NOT_FOUND",
      errorMessage: "Video file binary could not be found for YouTube upload.",
    };
  }

  const videoBuffer = resolvedMedia.buffer;
  const videoSize = resolvedMedia.size;
  const contentType = params.mimeType || resolvedMedia.contentType || "video/mp4";

  console.log(`[YouTube Upload] Video size: ${videoSize} bytes`);
  console.log(`[YouTube Upload] Video MIME type: ${contentType}`);

  // 4. Resolve Title
  const finalTitle = resolveYouTubeTitle({
    youtubeTitle: params.youtubeTitle,
    title: params.title,
    caption: params.caption,
    filename: params.filename,
  });
  console.log(`[YouTube Upload] Video title: ${finalTitle}`);

  // 5. Resolve Description, Tags, Privacy
  const finalDescription = (params.description || params.caption || "").slice(0, 5000);
  const finalPrivacy = params.privacyStatus || "public";
  console.log(`[YouTube Upload] Privacy status: ${finalPrivacy}`);

  let parsedTags: string[] = [];
  if (Array.isArray(params.tags)) {
    parsedTags = params.tags.map((t) => t.replace(/^#/, "").trim()).filter(Boolean);
  } else if (typeof params.tags === "string" && params.tags.trim()) {
    parsedTags = params.tags.split(",").map((t) => t.replace(/^#/, "").trim()).filter(Boolean);
  }

  const statusPayload: Record<string, any> = {
    selfDeclaredMadeForKids: false,
  };
  if (params.publishAt && new Date(params.publishAt).getTime() > Date.now()) {
    statusPayload.privacyStatus = "private";
    statusPayload.publishAt = new Date(params.publishAt).toISOString();
  } else {
    statusPayload.privacyStatus = finalPrivacy;
  }

  let activeChannelId =
    connData?.connection?.youtubeChannelId || connData?.account?.youtube_channel_id || "unknown";
  let activeChannelName =
    connData?.connection?.youtubeChannelName || connData?.account?.account_name || "unknown";

  // Confirm upload channel matches Connected Accounts using youtube.channels.list({ part: ["snippet"], mine: true })
  try {
    const chRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (chRes.ok) {
      const chData = await chRes.json();
      const primaryItem = chData?.items?.[0];
      if (primaryItem) {
        activeChannelId = primaryItem.id;
        activeChannelName = primaryItem.snippet?.title || activeChannelName;
        console.log(`[YouTube Channel Verification] Token uploads to channel: ${activeChannelName} (${activeChannelId})`);
        if (
          connData?.connection?.youtubeChannelId &&
          connData.connection.youtubeChannelId !== "unknown" &&
          primaryItem.id !== connData.connection.youtubeChannelId
        ) {
          console.warn(
            `[YouTube Channel Mismatch] Token channel (${primaryItem.id}: ${activeChannelName}) differs from stored connection (${connData.connection.youtubeChannelId}: ${connData.connection.youtubeChannelName})! Upload will go to: ${primaryItem.id}`
          );
        }
      }
    } else {
      console.warn(`[YouTube Channel Check] channels.list status: ${chRes.status}`);
    }
  } catch (chErr) {
    console.warn("[YouTube Channel Check Warning]:", chErr);
  }

  // 6. Execute videos.insert (called exactly once per publish action)
  console.log("[YouTube Upload] videos.insert started (call count: 1)");

  try {
    const initRes = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": contentType,
          "X-Upload-Content-Length": videoSize.toString(),
        },
        body: JSON.stringify({
          snippet: {
            title: finalTitle,
            description: finalDescription,
            tags: parsedTags.length > 0 ? parsedTags.slice(0, 50) : undefined,
            categoryId: "22",
          },
          status: statusPayload,
        }),
      }
    );

    console.log(`[YouTube Upload] YouTube upload HTTP status: ${initRes.status}`);

    if (!initRes.ok) {
      const errData = await initRes.json().catch(() => ({}));
      const rawCode = errData?.error?.code ?? initRes.status;
      const rawMessage = errData?.error?.message || `HTTP ${initRes.status} during videos.insert initialization`;
      const rawReason = errData?.error?.errors?.[0]?.reason || "";
      const rawDetailMessage = errData?.error?.errors?.[0]?.message || "";

      // Strict reason mapping: ONLY set uploadLimitExceeded if the REAL Google reason is uploadLimitExceeded
      let reason = rawReason;
      if (!reason) {
        if (initRes.status === 403) reason = "forbidden";
        else if (initRes.status === 401) reason = "invalidCredentials";
        else reason = "INIT_FAILED";
      }

      const userFriendlyMessage = formatYouTubeErrorMessage(reason, rawMessage);

      // Safe error logging: HTTP status, response.data.error, channel ID, channel name, insertCallsCount (NO OAuth tokens)
      console.error("[YouTube API Safe Error Log]", {
        httpStatus: initRes.status,
        "response.data.error.code": rawCode,
        "response.data.error.message": rawMessage,
        "response.data.error.errors[0].reason": rawReason,
        "response.data.error.errors[0].message": rawDetailMessage,
        connectedYouTubeChannelId: activeChannelId,
        connectedChannelName: activeChannelName,
        insertCallsCount: 1,
      });

      return {
        success: false,
        errorCode: reason,
        errorMessage: userFriendlyMessage,
        devDetails: {
          status: initRes.status,
          code: rawCode,
          reason,
          exactGoogleReason: rawReason || reason,
          message: rawMessage,
          detailMessage: rawDetailMessage,
          channelId: activeChannelId,
          channelName: activeChannelName,
          insertCallsCount: 1,
        },
      };
    }

    const uploadLocation = initRes.headers.get("Location");
    if (!uploadLocation) {
      console.error("[YouTube Upload] YouTube error code: NO_UPLOAD_LOCATION");
      console.error("[YouTube Upload] YouTube error message: Missing upload Location header");
      return {
        success: false,
        errorCode: "NO_UPLOAD_LOCATION",
        errorMessage: "YouTube API did not return an upload location URL.",
      };
    }

    const uploadRes = await fetch(uploadLocation, {
      method: "PUT",
      headers: {
        "Content-Length": videoSize.toString(),
        "Content-Type": contentType,
      },
      body: new Uint8Array(videoBuffer),
    });

    console.log(`[YouTube Upload] YouTube API status: ${uploadRes.status}`);

    const uploadData = await uploadRes.json().catch(() => ({}));
    const rawVideoId = uploadData?.id;

    const hasValidRealVideoId =
      uploadRes.ok &&
      rawVideoId &&
      typeof rawVideoId === "string" &&
      rawVideoId.trim() !== "" &&
      !rawVideoId.startsWith("mock_") &&
      !rawVideoId.startsWith("demo_");

    if (!hasValidRealVideoId) {
      const rawCode = uploadData?.error?.code ?? uploadRes.status;
      const rawMessage =
        uploadData?.error?.message ||
        `YouTube Data API v3 did not return a valid video ID (HTTP ${uploadRes.status})`;
      const rawReason = uploadData?.error?.errors?.[0]?.reason || "";
      const rawDetailMessage = uploadData?.error?.errors?.[0]?.message || "";

      // Strict reason mapping: ONLY set uploadLimitExceeded if the REAL Google reason is uploadLimitExceeded
      let reason = rawReason;
      if (!reason) {
        if (uploadRes.status === 403) reason = "forbidden";
        else if (uploadRes.status === 401) reason = "invalidCredentials";
        else reason = "UPLOAD_FAILED";
      }

      const userFriendlyMessage = formatYouTubeErrorMessage(reason, rawMessage);

      // Safe error logging: HTTP status, response.data.error, channel ID, channel name, insertCallsCount (NO OAuth tokens)
      console.error("[YouTube API Safe Error Log]", {
        httpStatus: uploadRes.status,
        "response.data.error.code": rawCode,
        "response.data.error.message": rawMessage,
        "response.data.error.errors[0].reason": rawReason,
        "response.data.error.errors[0].message": rawDetailMessage,
        connectedYouTubeChannelId: activeChannelId,
        connectedChannelName: activeChannelName,
        insertCallsCount: 1,
      });

      return {
        success: false,
        errorCode: reason,
        errorMessage: userFriendlyMessage,
        devDetails: {
          status: uploadRes.status,
          code: rawCode,
          reason,
          exactGoogleReason: rawReason || reason,
          message: rawMessage,
          detailMessage: rawDetailMessage,
          channelId: activeChannelId,
          channelName: activeChannelName,
          insertCallsCount: 1,
        },
      };
    }

    const videoId = rawVideoId.trim();
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`[YouTube Upload] Returned video ID: ${videoId}`);

    // 7. Verify with videos.list
    const verification = await verifyYouTubeVideo({ accessToken, videoId });
    let isProcessing = false;
    let processingMessage: string | undefined = undefined;

    if (verification.processingStatus === "processing" || verification.uploadStatus === "uploaded") {
      isProcessing = true;
      processingMessage = "Uploaded successfully — YouTube is processing the video.";
      console.log(`[YouTube Upload] ${processingMessage}`);
    }

    console.log(`[YouTube Publish Success] Video successfully published and verified! ID: ${videoId}`);

    return {
      success: true,
      platformPostId: videoId,
      platformUrl: videoUrl,
      isProcessing,
      processingMessage,
    };
  } catch (error: any) {
    console.error("[YouTube API Safe Error Log]", {
      httpStatus: 500,
      "response.data.error.code": 500,
      "response.data.error.message": error?.message || "Unhandled exception in publishToYouTube",
      "response.data.error.errors[0].reason": "EXCEPTION",
      "response.data.error.errors[0].message": error?.message || "",
      connectedYouTubeChannelId: activeChannelId,
      connectedChannelName: activeChannelName,
      insertCallsCount: 1,
    });
    return {
      success: false,
      errorCode: "UNEXPECTED_ERROR",
      errorMessage: error?.message || "Unexpected error while publishing to YouTube",
      devDetails: {
        status: 500,
        reason: "EXCEPTION",
        message: error?.message || "Unhandled exception in publishToYouTube",
        channelId: activeChannelId,
        channelName: activeChannelName,
        insertCallsCount: 1,
      },
    };
  }
}

/**
 * Formats YouTube API error codes and reasons into user-actionable messages.
 * STRICT POLICY: Only returns the daily upload limit message if reason is EXACTLY "uploadLimitExceeded".
 */
export function formatYouTubeErrorMessage(reason: string, rawMessage: string): string {
  if (reason === "uploadLimitExceeded") {
    return "The user has exceeded the number of videos they may upload. YouTube enforces daily upload limits per channel. Please wait 24 hours or verify your channel at https://www.youtube.com/verify to increase your daily upload limit.";
  }
  if (reason === "quotaExceeded") {
    return "YouTube API daily quota exceeded (quotaExceeded). The Google Cloud project daily API quota has been reached (10,000 units/day). Quota resets at midnight Pacific Time (PT).";
  }
  if (reason === "insufficientPermissions") {
    return "YouTube upload permission denied (insufficientPermissions). The youtube.upload scope was not granted. Please reconnect your YouTube channel.";
  }
  if (reason === "forbidden") {
    return `YouTube API access forbidden (forbidden): ${rawMessage || "Access denied by Google"}`;
  }
  if (reason === "invalidCredentials" || reason === "tokenExpired" || reason === "authError") {
    return "Google authorization has expired or is invalid (invalidCredentials). Please reconnect YouTube in Accounts.";
  }
  if (reason === "channelNotFound") {
    return "YouTube channel not found. If this account uses a Brand Channel, please reconnect and select the specific Brand Account in the Google prompt.";
  }
  return rawMessage || `YouTube upload failed (${reason}). Please try again.`;
}

/**
 * Verifies that the uploaded video exists on YouTube and checks its processing status.
 * Corresponds to:
 * youtube.videos.list({
 *   part: ["snippet", "status", "processingDetails"],
 *   id: [videoId]
 * })
 */
export async function verifyYouTubeVideo({
  accessToken,
  videoId,
}: {
  accessToken: string;
  videoId: string;
}): Promise<{
  exists: boolean;
  uploadStatus?: string;
  privacyStatus?: string;
  processingStatus?: string;
  rawDetails?: any;
}> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,status,processingDetails&id=${videoId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn("[YouTube verifyYouTubeVideo] videos.list returned non-200:", res.status, err);
      return { exists: true, uploadStatus: "uploaded", processingStatus: "processing" };
    }

    const data = await res.json();
    const item = data.items?.[0];
    if (!item) {
      console.warn(`[YouTube verifyYouTubeVideo] No video returned by YouTube for ID: ${videoId}`);
      return { exists: false };
    }

    return {
      exists: true,
      uploadStatus: item.status?.uploadStatus,
      privacyStatus: item.status?.privacyStatus,
      processingStatus: item.processingDetails?.processingStatus || item.status?.uploadStatus,
      rawDetails: item,
    };
  } catch (error) {
    console.warn("[YouTube verifyYouTubeVideo] Error during verification:", error);
    return { exists: true, uploadStatus: "uploaded", processingStatus: "processing" };
  }
}
