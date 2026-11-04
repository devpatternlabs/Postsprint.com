import { PublishResult } from "@/types";
import { META_GRAPH_VERSION } from "@/lib/oauth/meta-service";

const GRAPH_VIDEO_BASE = `https://graph-video.facebook.com/${META_GRAPH_VERSION}`;
const GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export interface FacebookPublishParams {
  pageId: string;
  accessToken: string;
  caption: string;
  title?: string;
  videoBuffer?: Buffer;
  videoUrl?: string;
  filename?: string;
}

/**
 * Publishes a real video to a Facebook Page using official Meta Graph Video API.
 * Supports direct multipart binary upload as well as hosted file_url.
 */
export async function publishToFacebook(params: FacebookPublishParams): Promise<PublishResult> {
  const { pageId, accessToken, caption, title, videoBuffer, videoUrl, filename = "video.mp4" } = params;

  console.log(`[Facebook Publishing] Facebook publishing started for Page: ${pageId}`);

  try {
    if (!pageId) {
      console.error("[Facebook Publishing] Meta error code: NO_FACEBOOK_PAGE");
      console.error("[Facebook Publishing] Meta error message: No connected Facebook Page was found.");
      return {
        success: false,
        errorCode: "NO_FACEBOOK_PAGE",
        errorMessage: "No connected Facebook Page was found. Please connect Meta in Accounts.",
      };
    }

    if (!accessToken) {
      console.error("[Facebook Publishing] Meta error code: NO_PAGE_ACCESS_TOKEN");
      return {
        success: false,
        errorCode: "NO_PAGE_ACCESS_TOKEN",
        errorMessage: "Missing Facebook Page access token. Please reconnect Meta in Accounts.",
      };
    }

    let res: Response;

    // Option A: Direct multipart upload if video buffer is available
    if (videoBuffer && Buffer.isBuffer(videoBuffer) && videoBuffer.length > 0) {
      console.log(`[Facebook Publishing] Uploading video binary directly to Facebook (${videoBuffer.length} bytes)...`);

      const formData = new FormData();
      const blob = new Blob([new Uint8Array(videoBuffer)], { type: "video/mp4" });
      formData.append("source", blob, filename);
      formData.append("description", caption);
      if (title) formData.append("title", title);
      formData.append("access_token", accessToken);

      res = await fetch(`${GRAPH_VIDEO_BASE}/${pageId}/videos`, {
        method: "POST",
        body: formData,
      });
    } else if (videoUrl && videoUrl.startsWith("http")) {
      // Option B: Post URL via file_url parameter
      console.log(`[Facebook Publishing] Uploading video via accessible URL to Facebook...`);

      const postUrl = new URL(`${GRAPH_VIDEO_BASE}/${pageId}/videos`);
      postUrl.searchParams.set("file_url", videoUrl);
      postUrl.searchParams.set("description", caption);
      if (title) postUrl.searchParams.set("title", title);
      postUrl.searchParams.set("access_token", accessToken);

      res = await fetch(postUrl.toString(), { method: "POST" });
    } else {
      console.error("[Facebook Publishing] Meta error code: NO_VIDEO_MEDIA");
      return {
        success: false,
        errorCode: "NO_VIDEO_MEDIA",
        errorMessage: "No video file or URL available for Facebook video publishing.",
      };
    }

    console.log(`[Facebook Publishing] Meta HTTP status: ${res.status}`);

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.id) {
      const code = data.error?.code || res.status;
      const message = data.error?.message || "Failed to publish video to Facebook Page.";

      console.error(`[Facebook Publishing] Meta error code: ${code}`);
      console.error(`[Facebook Publishing] Meta error message: ${message}`);
      console.error("[Facebook Publishing] Meta raw error:", JSON.stringify(data, null, 2));

      return {
        success: false,
        errorCode: code.toString(),
        errorMessage: message,
        devDetails: { status: res.status, raw: data },
      };
    }

    const videoId = data.id.toString().trim();
    console.log(`[Facebook Publishing] Returned Facebook video ID: ${videoId}`);

    const platformUrl = `https://www.facebook.com/${pageId}/videos/${videoId}`;

    return {
      success: true,
      platformPostId: videoId,
      platformUrl,
    };
  } catch (error: any) {
    console.error("[Facebook Publishing] Exception:", error);
    return {
      success: false,
      errorCode: "UNEXPECTED_ERROR",
      errorMessage: error?.message || "Unexpected error while publishing to Facebook",
    };
  }
}
