import { Platform, PublishResult } from "@/types";

/**
 * Checks if mock mode is enabled via environment variable.
 */
export function isMockMode(): boolean {
  return process.env.SOCIAL_API_MOCK_MODE === "true";
}

/**
 * Simulates publishing to social platforms for testing and development.
 * Allows realistic multi-platform verification without live social developer apps.
 */
export async function mockPublishPlatform(
  platform: Platform,
  caption: string
): Promise<PublishResult> {
  // Simulate network/transcoding delay (1.5 - 2.5 seconds)
  const delay = Math.floor(Math.random() * 1000) + 1500;
  await new Promise((resolve) => setTimeout(resolve, delay));

  // Helpful testing feature: if caption contains #fail_<platform>, simulate platform failure to test retries!
  if (caption.toLowerCase().includes(`#fail_${platform}`)) {
    return {
      success: false,
      errorCode: "SIMULATED_FAILURE",
      errorMessage: `Simulated failure for ${platform}. Click Retry to test retry flow.`,
    };
  }

  const randomId = Math.random().toString(36).substring(2, 10);
  const timestamp = Date.now().toString(36);
  const postId = `mock_${platform}_${randomId}_${timestamp}`;

  switch (platform) {
    case "instagram":
      return {
        success: true,
        platformPostId: postId,
        platformUrl: `https://www.instagram.com/p/${postId}/`,
      };
    case "facebook":
      return {
        success: true,
        platformPostId: postId,
        platformUrl: `https://www.facebook.com/watch/?v=${postId}`,
      };
    case "youtube":
      return {
        success: false,
        errorCode: "MOCK_YOUTUBE_DISALLOWED",
        errorMessage:
          "Mock YouTube uploads are disabled. Real YouTube uploads via YouTube Data API v3 are required.",
      };
    case "snapchat":
      return {
        success: true,
        actionRequired: true,
        actionType: "snapchat_share",
        actionMessage: "Continue sharing to Snapchat",
        actionPayload: {
          shareUrl: "https://www.snapchat.com",
          caption,
        },
        errorMessage: "Action required: Finish sharing in Snapchat",
      };
    case "sharechat":
      return {
        success: true,
        actionRequired: true,
        actionType: "sharechat_share",
        actionMessage: "Open ShareChat to finish posting",
        actionPayload: {
          shareUrl: "https://sharechat.com",
          caption,
        },
        errorMessage: "Action required: Finish sharing in ShareChat",
      };
    default:
      return {
        success: false,
        errorCode: "PLATFORM_NOT_SUPPORTED",
        errorMessage: `Platform ${platform} is not supported.`,
      };
  }
}
