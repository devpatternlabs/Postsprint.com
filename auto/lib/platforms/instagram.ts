import { PublishResult } from "@/types";
import { META_GRAPH_VERSION, META_GRAPH_BASE } from "@/lib/oauth/meta-service";
import { getExternallyAccessibleVideoUrl } from "@/lib/storage/external-media";

export interface InstagramPublishParams {
  instagramAccountId: string | null;
  accessToken: string;
  caption: string;
  videoBuffer?: Buffer;
  videoUrl?: string;
  filename?: string;
  storagePath?: string;
}

/**
 * Publishes a real video as an Instagram Reel using the official Meta Graph API.
 * Follows the required 4-step sequence:
 * 1. Resolve external video URL (Meta cannot fetch from localhost/file:)
 * 2. Create Instagram Reel container (media_type=REELS)
 * 3. Poll container status until FINISHED
 * 4. Publish container (media_publish)
 * 5. Return real Instagram media ID and permalink
 */
export async function publishToInstagram(
  params: InstagramPublishParams
): Promise<PublishResult> {
  const {
    instagramAccountId,
    accessToken,
    caption,
    videoBuffer,
    videoUrl,
    filename = "video.mp4",
    storagePath,
  } = params;

  console.log("[Instagram Publishing] Instagram publishing started");

  try {
    // 1. Validate linked Instagram Professional account
    if (!instagramAccountId || instagramAccountId.trim() === "") {
      const msg = "No Instagram Professional account is connected to this Facebook Page.";
      console.error("[Instagram Publishing] Meta error code: NO_INSTAGRAM_ACCOUNT");
      console.error("[Instagram Publishing] Meta error message:", msg);
      return {
        success: false,
        errorCode: "NO_INSTAGRAM_ACCOUNT",
        errorMessage: msg,
      };
    }

    if (!accessToken) {
      console.error("[Instagram Publishing] Meta error code: NO_ACCESS_TOKEN");
      return {
        success: false,
        errorCode: "NO_ACCESS_TOKEN",
        errorMessage: "Missing Meta access token for Instagram publishing.",
      };
    }

    // 2. Resolve externally accessible video URL
    let resolvedVideoUrl = videoUrl;
    let cleanupFn: (() => Promise<void>) | undefined = undefined;

    const isLocalOrMissing =
      !resolvedVideoUrl ||
      resolvedVideoUrl.includes("localhost") ||
      resolvedVideoUrl.includes("127.0.0.1") ||
      resolvedVideoUrl.startsWith("file:") ||
      resolvedVideoUrl.startsWith("blob:");

    if (isLocalOrMissing) {
      if (!videoBuffer || videoBuffer.length === 0) {
        console.error("[Instagram Publishing] Meta error code: NO_VIDEO_MEDIA");
        return {
          success: false,
          errorCode: "NO_VIDEO_MEDIA",
          errorMessage: "No video file available for Instagram Reel upload.",
        };
      }

      console.log("[Instagram Publishing] Resolving externally accessible video URL for Meta servers...");
      const externalMedia = await getExternallyAccessibleVideoUrl({
        buffer: videoBuffer,
        filename,
        storagePath,
      });

      resolvedVideoUrl = externalMedia.url;
      cleanupFn = externalMedia.cleanup;
    }

    if (!resolvedVideoUrl) {
      console.error("[Instagram Publishing] Meta error code: NO_ACCESSIBLE_VIDEO_URL");
      return {
        success: false,
        errorCode: "NO_ACCESSIBLE_VIDEO_URL",
        errorMessage: "Could not generate an accessible external video URL for Instagram.",
      };
    }

    console.log(`[Instagram Publishing] Using external video URL for container creation`);

    // 3. Step 1: Create media container
    console.log(`[Instagram Publishing] Creating Instagram media container (media_type=REELS)...`);

    const createUrl = new URL(`${META_GRAPH_BASE}/${instagramAccountId}/media`);
    createUrl.searchParams.set("media_type", "REELS");
    createUrl.searchParams.set("video_url", resolvedVideoUrl);
    createUrl.searchParams.set("caption", caption);
    createUrl.searchParams.set("share_to_feed", "true");
    createUrl.searchParams.set("access_token", accessToken);

    const createRes = await fetch(createUrl.toString(), { method: "POST" });
    const createData = await createRes.json();

    console.log(`[Instagram Publishing] Meta HTTP status (container create): ${createRes.status}`);

    if (!createRes.ok || !createData.id) {
      const code = createData.error?.code || createRes.status;
      const message =
        createData.error?.message ||
        "Failed to create Instagram media container. Check video aspect ratio and format.";

      console.error(`[Instagram Publishing] Meta error code: ${code}`);
      console.error(`[Instagram Publishing] Meta error message: ${message}`);
      console.error("[Instagram Publishing] Meta raw error:", JSON.stringify(createData, null, 2));

      if (cleanupFn) await cleanupFn().catch(() => {});

      return {
        success: false,
        errorCode: code.toString(),
        errorMessage: message,
        devDetails: { status: createRes.status, raw: createData },
      };
    }

    const containerId = createData.id;
    console.log(`[Instagram Publishing] Instagram container created: ${containerId}`);

    // 4. Step 2: Poll container status until ready
    const statusCheck = await pollInstagramContainerStatus(containerId, accessToken, 30, 3000);

    if (!statusCheck.ready) {
      console.error(`[Instagram Publishing] Meta error: ${statusCheck.error}`);
      if (cleanupFn) await cleanupFn().catch(() => {});

      return {
        success: false,
        errorCode: "PROCESSING_FAILED",
        errorMessage: statusCheck.error || "Instagram video processing timed out or failed.",
      };
    }

    // 5. Step 3: Publish container
    console.log(`[Instagram Publishing] Instagram media_publish started for container: ${containerId}`);

    const publishUrl = new URL(`${META_GRAPH_BASE}/${instagramAccountId}/media_publish`);
    publishUrl.searchParams.set("creation_id", containerId);
    publishUrl.searchParams.set("access_token", accessToken);

    const publishRes = await fetch(publishUrl.toString(), { method: "POST" });
    const publishData = await publishRes.json();

    console.log(`[Instagram Publishing] Meta HTTP status (media_publish): ${publishRes.status}`);

    if (!publishRes.ok || !publishData.id) {
      const code = publishData.error?.code || publishRes.status;
      const message = publishData.error?.message || "Failed to publish container to Instagram.";

      console.error(`[Instagram Publishing] Meta error code: ${code}`);
      console.error(`[Instagram Publishing] Meta error message: ${message}`);

      if (cleanupFn) await cleanupFn().catch(() => {});

      return {
        success: false,
        errorCode: code.toString(),
        errorMessage: message,
        devDetails: { status: publishRes.status, raw: publishData },
      };
    }

    const mediaId = publishData.id.toString().trim();
    console.log(`[Instagram Publishing] Instagram media published! Real ID: ${mediaId}`);

    // 6. Step 4: Fetch permalink
    let platformUrl = `https://www.instagram.com/p/${mediaId}`;
    try {
      const permalinkRes = await fetch(
        `${META_GRAPH_BASE}/${mediaId}?fields=permalink&access_token=${accessToken}`
      );
      if (permalinkRes.ok) {
        const permalinkData = await permalinkRes.json();
        if (permalinkData.permalink) {
          platformUrl = permalinkData.permalink;
        }
      }
    } catch {
      // Non-critical fallback
    }

    // 7. Clean up temporary external media only AFTER publishing finishes
    if (cleanupFn) {
      await cleanupFn().catch(() => {});
    }

    return {
      success: true,
      platformPostId: mediaId,
      platformUrl,
    };
  } catch (error: any) {
    console.error("[Instagram Publishing] Exception:", error);
    return {
      success: false,
      errorCode: "UNEXPECTED_ERROR",
      errorMessage: error?.message || "Unexpected error while publishing to Instagram",
    };
  }
}

/**
 * Polls the Instagram container status until FINISHED, ERROR, or EXPIRED.
 */
async function pollInstagramContainerStatus(
  containerId: string,
  accessToken: string,
  maxAttempts = 30,
  intervalMs = 3000
): Promise<{ ready: boolean; error?: string }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    try {
      const url = `${META_GRAPH_BASE}/${containerId}?fields=status_code,status&access_token=${accessToken}`;
      const res = await fetch(url);
      const data = await res.json();

      const statusCode = data.status_code;
      console.log(`[Instagram Publishing] Instagram processing status: ${statusCode} (attempt ${attempt}/${maxAttempts})`);

      if (statusCode === "FINISHED") {
        return { ready: true };
      }

      if (statusCode === "ERROR" || statusCode === "EXPIRED") {
        return {
          ready: false,
          error: data.status || `Instagram container failed with status: ${statusCode}`,
        };
      }
    } catch (err: any) {
      // Continue polling on transient network glitch
    }
  }

  return { ready: false, error: "Timed out waiting for Instagram video processing" };
}

/**
 * Deletes published media from Instagram via the Meta Graph API.
 * Endpoint: DELETE https://graph.facebook.com/v21.0/{mediaId}?access_token={accessToken}
 */
export async function deleteFromInstagram(
  mediaId: string,
  accessToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (mediaId.startsWith("mock_")) {
      console.log(`[Instagram Delete] Mock Instagram media ${mediaId} deleted successfully.`);
      return { success: true };
    }

    if (!mediaId || !accessToken) {
      return {
        success: false,
        error: "Missing media ID or access token for Instagram deletion.",
      };
    }

    const res = await fetch(`${META_GRAPH_BASE}/${mediaId}?access_token=${accessToken}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Instagram Delete] Failed to delete media ${mediaId}:`, errText);
      let errMsg = `Instagram API Error (${res.status}): ${errText}`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) {
          errMsg = parsed.error.message;
        }
      } catch {}
      return { success: false, error: errMsg };
    }

    const data = await res.json().catch(() => ({ success: true }));
    console.log(`[Instagram Delete] Successfully deleted Instagram media ${mediaId}:`, data);
    return { success: true };
  } catch (err: any) {
    console.error("[Instagram Delete] Exception:", err);
    return { success: false, error: err.message || "Failed to delete Instagram media" };
  }
}

