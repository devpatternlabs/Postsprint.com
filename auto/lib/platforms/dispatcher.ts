import { createAdminClient } from "@/lib/supabase/admin";
import { publishToInstagram } from "./instagram";
import { publishToFacebook } from "./facebook";
import { publishToYouTube, resolveVideoBuffer } from "./youtube";
import { calculateAggregatePostStatus } from "@/lib/utils/post-status";
import { getConnectedMetaAccount } from "@/lib/oauth/meta-service";
import { mockStore } from "@/lib/mock-store";
import { TargetStatus, PublishResult, Platform } from "@/types";
import { snapchatProvider } from "@/providers/snapchat";
import { shareChatProvider } from "@/providers/sharechat";

/**
 * Publishes all pending targets for a given post.
 * Can target a specific platform (e.g., during single-platform retry).
 */
export async function dispatchPostPublishing(
  postId: string,
  specificPlatform?: Platform
): Promise<void> {
  let post: any = null;
  let targets: any[] = [];
  let isMockDatabase = false;
  let adminSupabase: any = null;

  // 1. Try Supabase
  try {
    adminSupabase = createAdminClient();
    const { data: sbPost } = await adminSupabase
      .from("posts")
      .select("*")
      .eq("id", postId)
      .single();

    if (sbPost) {
      post = sbPost;
      const { data: sbTargets } = await adminSupabase
        .from("post_targets")
        .select("*")
        .eq("post_id", postId);
      targets = sbTargets || [];
    }
  } catch {
    // Fallback if Supabase is not configured
  }

  // 2. Fallback to mockStore
  if (!post) {
    const mockPost = mockStore.getPostById(postId);
    if (mockPost) {
      post = mockPost;
      targets = mockPost.targets || [];
      isMockDatabase = true;
    }
  }

  if (!post) {
    console.error(`[Dispatcher] Post ${postId} not found in database or mock store`);
    return;
  }

  // Update post to publishing
  if (isMockDatabase) {
    mockStore.updatePostStatus(postId, "publishing");
  } else if (adminSupabase) {
    await adminSupabase
      .from("posts")
      .update({ status: "publishing", updated_at: new Date().toISOString() })
      .eq("id", postId);
  }

  // Filter targets to process:
  // - Never process already published or currently uploading targets (prevents duplicate runs)
  // - If specificPlatform is set (manual user retry), allow retrying this specific target
  // - Otherwise (regular dispatch), only process queued/pending targets, never automatically retrying old failed jobs
  const targetsToProcess = targets.filter((t) => {
    if (t.status === "published" || t.status === "uploading") {
      return false;
    }
    if (specificPlatform) {
      return t.platform === specificPlatform;
    }
    return t.status === "queued" || t.status === "pending";
  });

  console.log(
    `[Dispatcher] Dispatching post ${postId} for ${targetsToProcess.length} target(s)${
      specificPlatform ? ` (single platform retry: ${specificPlatform})` : ""
    }`
  );

  for (const target of targetsToProcess) {
    // Atomically claim target to prevent duplicate execution across concurrent requests
    if (isMockDatabase) {
      mockStore.updateTarget(postId, target.platform, {
        status: "uploading",
        started_at: new Date().toISOString(),
      });
    } else if (adminSupabase) {
      const { data: claimedTarget } = await adminSupabase
        .from("post_targets")
        .update({
          status: "uploading",
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", target.id)
        .neq("status", "uploading")
        .neq("status", "published")
        .select()
        .maybeSingle();

      if (!claimedTarget) {
        console.log(`[Dispatcher] Target ${target.id} already claimed or published. Skipping.`);
        continue;
      }
    }

    let result: PublishResult;

    let videoSignedUrl: string | undefined;
    if (adminSupabase && post.video_storage_path) {
      try {
        const { data: signedData } = await adminSupabase.storage
          .from("social-videos")
          .createSignedUrl(post.video_storage_path, 7200);
        if (signedData?.signedUrl) {
          videoSignedUrl = signedData.signedUrl;
        }
      } catch {}
    }

    if (target.platform === "youtube") {
      // REAL YOUTUBE PUBLISHING: Always execute real YouTube Data API v3 publishing
      console.log(
        `[Dispatcher] Executing real YouTube Data API publishing for post ${postId}...`
      );
      result = await publishToYouTube({
        userId: post.user_id,
        videoStoragePath: post.video_storage_path,
        videoUrl: videoSignedUrl,
        filename: post.video_filename,
        youtubeTitle: post.youtube_title,
        title: post.youtube_title,
        caption: post.caption,
        description: (post as any).description || post.caption,
        tags: (post as any).tags,
        privacyStatus: post.privacy_status || "public",
      });
    } else if (target.platform === "facebook") {
      // REAL FACEBOOK PUBLISHING
      console.log(
        `[Dispatcher] Executing real Facebook Page publishing for post ${postId}...`
      );
      const userId = post.user_id;
      const metaConn = userId ? await getConnectedMetaAccount(userId) : null;

      if (!metaConn) {
        result = {
          success: false,
          errorCode: "META_NOT_CONNECTED",
          errorMessage:
            "Your Meta account is not connected. Please connect Instagram + Facebook in Accounts.",
        };
      } else {
        const videoRes = resolveVideoBuffer({
          videoStoragePath: post.video_storage_path,
          filename: post.video_filename,
        });

        result = await publishToFacebook({
          pageId: metaConn.connection.facebookPageId,
          accessToken: metaConn.decryptedPageToken,
          caption: post.caption,
          title: post.youtube_title || undefined,
          videoBuffer: videoRes?.buffer,
          videoUrl: videoSignedUrl,
          filename: post.video_filename || "video.mp4",
        });
      }
    } else if (target.platform === "instagram") {
      // REAL INSTAGRAM REELS PUBLISHING
      console.log(
        `[Dispatcher] Executing real Instagram Reels publishing for post ${postId}...`
      );
      const userId = post.user_id;
      const metaConn = userId ? await getConnectedMetaAccount(userId) : null;

      if (!metaConn) {
        result = {
          success: false,
          errorCode: "META_NOT_CONNECTED",
          errorMessage:
            "Your Meta account is not connected. Please connect Instagram + Facebook in Accounts.",
        };
      } else if (!metaConn.connection.instagramAccountId) {
        result = {
          success: false,
          errorCode: "NO_INSTAGRAM_ACCOUNT",
          errorMessage:
            "No Instagram Professional account is connected to this Facebook Page.",
        };
      } else {
        const videoRes = resolveVideoBuffer({
          videoStoragePath: post.video_storage_path,
          filename: post.video_filename,
        });



        result = await publishToInstagram({
          instagramAccountId: metaConn.connection.instagramAccountId,
          accessToken: metaConn.decryptedPageToken,
          caption: post.caption,
          videoBuffer: videoRes?.buffer,
          videoUrl: videoSignedUrl,
          filename: post.video_filename || "video.mp4",
          storagePath: post.video_storage_path,
        });
      }
    } else if (target.platform === "snapchat") {
      console.log(`[Dispatcher] Executing Snapchat publishing for post ${postId}...`);
      result = await snapchatProvider.publish({
        userId: post.user_id,
        postId: post.id,
        videoStoragePath: post.video_storage_path,
        videoUrl: videoSignedUrl,
        filename: post.video_filename,
        caption: post.caption,
        title: post.youtube_title,
      });
    } else if (target.platform === "sharechat") {
      console.log(`[Dispatcher] Executing ShareChat publishing for post ${postId}...`);
      result = await shareChatProvider.publish({
        userId: post.user_id,
        postId: post.id,
        videoStoragePath: post.video_storage_path,
        videoUrl: videoSignedUrl,
        filename: post.video_filename,
        caption: post.caption,
        title: post.youtube_title,
        tags: (post as any).tags,
      });
    } else {
      result = {
        success: false,
        errorCode: "PLATFORM_NOT_SUPPORTED",
        errorMessage: `Platform ${target.platform} is not supported.`,
      };
    }

    // Update target status based on result
    if (result.actionRequired) {
      if (isMockDatabase) {
        mockStore.updateTarget(postId, target.platform, {
          status: "action_required",
          action_required: true,
          action_type: result.actionType || null,
          action_message: result.actionMessage || null,
          action_payload: result.actionPayload || null,
          error_code: null,
          error_message: result.errorMessage || result.actionMessage || null,
        });
      } else if (adminSupabase) {
        try {
          await adminSupabase
            .from("post_targets")
            .update({
              status: "action_required",
              error_code: null,
              error_message: result.errorMessage || result.actionMessage || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", target.id);
        } catch {
          // If column check constraint in Supabase rejects action_required, fallback to status
        }
      }
    } else if (result.success) {
      if (isMockDatabase) {
        mockStore.updateTarget(postId, target.platform, {
          status: "published",
          platform_post_id: result.platformPostId,
          platform_url: result.platformUrl,
          error_code: null,
          error_message: null,
          published_at: new Date().toISOString(),
        });
      } else if (adminSupabase) {
        await adminSupabase
          .from("post_targets")
          .update({
            status: "published",
            platform_post_id: result.platformPostId,
            platform_url: result.platformUrl,
            error_code: null,
            error_message: null,
            published_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", target.id);
      }
    } else {
      if (isMockDatabase) {
        mockStore.updateTarget(postId, target.platform, {
          status: "failed",
          attempt_count: (target.attempt_count || 0) + 1,
          error_code: result.errorCode || "UPLOAD_FAILED",
          error_message: result.errorMessage,
        });
      } else if (adminSupabase) {
        await adminSupabase
          .from("post_targets")
          .update({
            status: "failed",
            attempt_count: (target.attempt_count || 0) + 1,
            error_code: result.errorCode || "UPLOAD_FAILED",
            error_message: result.errorMessage,
            updated_at: new Date().toISOString(),
          })
          .eq("id", target.id);
      }
    }
  }

  // 4. Update overall post status and auto-clean storage upon completion
  let finalStatuses: TargetStatus[] = [];
  if (isMockDatabase) {
    const updatedPost = mockStore.getPostById(postId);
    finalStatuses = (updatedPost?.targets || []).map((t) => t.status as TargetStatus);
    const aggregateStatus = calculateAggregatePostStatus(finalStatuses);
    mockStore.updatePostStatus(postId, aggregateStatus);

    if (aggregateStatus === "completed" && post.video_storage_path) {
      // Auto-clean local uploaded storage
      try {
        const fs = require("fs");
        const path = require("path");
        const safePath = post.video_storage_path.replace(/\.\./g, "").replace(/^\/+/, "");
        const localFile = path.join(process.cwd(), ".data", "uploads", safePath);
        if (fs.existsSync(localFile)) {
          fs.unlinkSync(localFile);
          console.log(`[Auto-Clean] Deleted local upload file for completed post ${postId}: ${localFile}`);
        }
      } catch (cleanErr) {
        console.warn("[Auto-Clean Warning]", cleanErr);
      }
    }
  } else if (adminSupabase) {
    const { data: updatedTargets } = await adminSupabase
      .from("post_targets")
      .select("status")
      .eq("post_id", postId);

    finalStatuses = (updatedTargets || []).map((t: any) => t.status as TargetStatus);
    const aggregateStatus = calculateAggregatePostStatus(finalStatuses);
    await adminSupabase
      .from("posts")
      .update({
        status: aggregateStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId);

    if (aggregateStatus === "completed" && post.video_storage_path) {
      // Auto-clean from Supabase Storage and clear storage path
      try {
        await adminSupabase.storage.from("social-videos").remove([post.video_storage_path]);
        await adminSupabase.from("posts").update({ video_storage_path: null }).eq("id", postId);
        console.log(`[Auto-Clean] Cleaned Supabase storage for completed post ${postId}`);
      } catch (cleanErr) {
        console.warn("[Auto-Clean Supabase Warning]", cleanErr);
      }
    }
  }
}

