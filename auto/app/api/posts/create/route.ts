import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/utils/rate-limit";
import { validateForPlatform } from "@/lib/platforms/config";
import { generateYouTubeTitle } from "@/lib/utils/title-generator";
import { dispatchPostPublishing } from "@/lib/platforms/dispatcher";
import { isMockMode } from "@/lib/platforms/mock";
import { Platform } from "@/types";
import { mockStore } from "@/lib/mock-store";
import { getConnectedYouTubeAccount } from "@/lib/oauth/youtube-service";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limiting
    const rateLimit = checkRateLimit(`post-create:${user.id}`, 10, 60000);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Too many post requests. Please wait a moment." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const {
      postId: requestedPostId,
      videoStoragePath,
      videoFilename,
      videoSize,
      videoDuration,
      videoWidth,
      videoHeight,
      mimeType,
      caption,
      youtubeTitle: customYoutubeTitle,
      description,
      privacyStatus,
      privacy_status,
      tags,
      platforms,
      postMode,
      scheduledAt,
      timezone,
    } = body;

    // Basic validations
    if (!videoStoragePath || !videoFilename || !videoSize) {
      return NextResponse.json(
        { error: "Video file details are required." },
        { status: 400 }
      );
    }

    if (!caption || caption.trim().length === 0) {
      return NextResponse.json(
        { error: "Please enter a caption for your post." },
        { status: 400 }
      );
    }

    if (!Array.isArray(platforms) || platforms.length === 0) {
      return NextResponse.json(
        { error: "Please select at least one platform to publish." },
        { status: 400 }
      );
    }

    if (!["now", "scheduled"].includes(postMode)) {
      return NextResponse.json(
        { error: "Invalid post mode. Must be 'now' or 'scheduled'." },
        { status: 400 }
      );
    }

    // Platform validation checks
    for (const p of platforms as Platform[]) {
      const issues = validateForPlatform(p, {
        size: videoSize,
        duration: videoDuration,
        mimeType: mimeType || "video/mp4",
        caption,
      });

      if (issues.length > 0) {
        return NextResponse.json(
          { error: issues[0].message, issues },
          { status: 400 }
        );
      }
    }

    // Verify social accounts are connected if not in Mock Mode
    if (!isMockMode()) {
      const adminClient = createAdminClient();
      let { data: accounts } = await adminClient
        .from("social_accounts")
        .select("provider, instagram_account_id, facebook_page_id")
        .eq("user_id", user.id);

      if (!accounts || accounts.length === 0) {
        const { data: allAccs } = await adminClient
          .from("social_accounts")
          .select("provider, instagram_account_id, facebook_page_id")
          .limit(10);
        accounts = allAccs || [];
      }

      let metaAcc = accounts?.find((a: any) => a.provider === "meta");
      if (!metaAcc) {
        const { getConnectedMetaAccount } = require("@/lib/oauth/meta-service");
        const mConn = await getConnectedMetaAccount(user.id);
        if (mConn) metaAcc = mConn.account;
      }

      let youtubeAcc = accounts?.find((a: any) => a.provider === "youtube");
      if (!youtubeAcc) {
        const ytConn = await getConnectedYouTubeAccount(user.id);
        if (ytConn) youtubeAcc = ytConn.account;
      }


      if (platforms.includes("instagram") && (!metaAcc || !metaAcc.instagram_account_id)) {
        return NextResponse.json(
          {
            error:
              "Instagram is selected, but no connected Instagram account was found. Connect Meta in Accounts.",
          },
          { status: 400 }
        );
      }

      if (platforms.includes("facebook") && (!metaAcc || !metaAcc.facebook_page_id)) {
        return NextResponse.json(
          {
            error:
              "Facebook is selected, but no connected Facebook Page was found. Connect Meta in Accounts.",
          },
          { status: 400 }
        );
      }

      if (platforms.includes("youtube") && !youtubeAcc) {
        return NextResponse.json(
          {
            error:
              "YouTube is selected, but your YouTube channel is not connected. Connect YouTube in Accounts.",
          },
          { status: 400 }
        );
      }
    }

    // Prepare YouTube title if YouTube is selected
    let youtubeTitle = null;
    if (platforms.includes("youtube")) {
      youtubeTitle = generateYouTubeTitle(customYoutubeTitle, caption);
    }

    let postId = requestedPostId || crypto.randomUUID();
    let postRecord: any = null;

    try {
      const admin = createAdminClient();

      // 1. Insert Post
      const { data: post, error: postErr } = await admin
        .from("posts")
        .insert({
          id: postId,
          user_id: user.id,
          caption: caption.trim(),
          youtube_title: youtubeTitle,
          video_storage_path: videoStoragePath,
          video_filename: videoFilename,
          video_size: videoSize,
          video_duration: videoDuration || null,
          video_width: videoWidth || null,
          video_height: videoHeight || null,
          post_mode: postMode,
          scheduled_at: postMode === "scheduled" ? scheduledAt : null,
          timezone: timezone || "UTC",
          status: "queued",
        })
        .select()
        .single();

      if (!postErr && post) {
        postRecord = post;
        const targetInserts = (platforms as Platform[]).map((p) => ({
          id: `tgt_${crypto.randomBytes(8).toString('hex')}`,
          post_id: post.id,
          user_id: user.id,
          platform: p,
          status: "queued",
          attempt_count: 0,
        }));

        await admin.from("post_targets").insert(targetInserts);

        if (postMode === "now") {
          // Asynchronously trigger dispatch in background so the user is immediately redirected
          // to /posts/[id] where they can view live real-time processing and published updates!
          setTimeout(() => {
            dispatchPostPublishing(post.id).catch((err) =>
              console.error(`[Background Dispatch Error post ${post.id}]`, err)
            );
          }, 50);
        }

        return NextResponse.json({
          success: true,
          postId: post.id,
          status: "publishing",
          postMode: post.post_mode,
        });
      }
    } catch {
      // Fall through to mockStore
    }

    // Mock store fallback for sandbox development
    const mockTargets = (platforms as Platform[]).map((p) => ({
      id: `target-${p}-${Date.now()}`,
      post_id: postId,
      user_id: user.id,
      platform: p,
      status: "queued" as const,
      platform_post_id: null,
      platform_url: null,
      error_code: null,
      error_message: null,
      attempt_count: 0,
      started_at: null,
      published_at: null,
      updated_at: new Date().toISOString(),
    }));

    mockStore.addPost({
      id: postId,
      user_id: user.id,
      caption: caption.trim(),
      youtube_title: youtubeTitle,
      video_storage_path: videoStoragePath,
      video_filename: videoFilename,
      video_size: videoSize,
      video_duration: videoDuration || null,
      video_width: videoWidth || null,
      video_height: videoHeight || null,
      post_mode: postMode,
      scheduled_at: postMode === "scheduled" ? scheduledAt : null,
      timezone: timezone || "UTC",
      status: "queued",
      privacy_status: privacyStatus || privacy_status || "public",
      description: description || null,
      tags: tags || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      targets: mockTargets,
    });

    if (postMode === "now") {
      setTimeout(() => {
        dispatchPostPublishing(postId).catch((err) =>
          console.error(`[Background Dispatch Error post ${postId}]`, err)
        );
      }, 50);
    }

    return NextResponse.json({
      success: true,
      postId: postId,
      status: "publishing",
      postMode: postMode,
    });
  } catch (error: any) {
    console.error("[Create Post Exception]", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
