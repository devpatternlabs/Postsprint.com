import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchPostPublishing } from "@/lib/platforms/dispatcher";
import { checkRateLimit } from "@/lib/utils/rate-limit";
import { Platform } from "@/types";
import { mockStore } from "@/lib/mock-store";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: postId } = params;

    const rateLimit = checkRateLimit(`retry:${user.id}:${postId}`, 10, 30000);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Too many retry attempts. Please wait 30 seconds." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const platform: Platform | undefined = body.platform;

    let postFound = false;

    // 1. Try Supabase
    try {
      const admin = createAdminClient();
      const { data: post, error: postErr } = await admin
        .from("posts")
        .select("id, user_id")
        .eq("id", postId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!postErr && post) {
        postFound = true;
        let query = admin
          .from("post_targets")
          .select("*")
          .eq("post_id", postId)
          .neq("status", "published"); // Never retry already published targets

        if (platform) {
          query = query.eq("platform", platform);
        }

        const { data: targets, error: targetsErr } = await query;

        if (targetsErr || !targets || targets.length === 0) {
          return NextResponse.json(
            { error: "No failed or pending targets eligible for retry." },
            { status: 400 }
          );
        }

        const targetIds = targets.map((t) => t.id);
        await admin
          .from("post_targets")
          .update({
            status: "queued",
            error_code: null,
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .in("id", targetIds);

        await admin
          .from("posts")
          .update({
            status: "publishing",
            updated_at: new Date().toISOString(),
          })
          .eq("id", postId);

        try {
          await dispatchPostPublishing(postId, platform);
        } catch (err) {
          console.error(`[Retry Dispatch Error post ${postId}]`, err);
        }

        return NextResponse.json({
          success: true,
          message: `Retrying ${targets.length} platform(s)...`,
        });
      }
    } catch {
      // Fall through to mockStore
    }

    // 2. Try mockStore
    const mockPost = mockStore.getPostById(postId, user.id);
    if (mockPost) {
      postFound = true;
      const targets = (mockPost.targets || []).filter(
        (t) => t.status !== "published" && (!platform || t.platform === platform)
      );

      if (targets.length === 0) {
        return NextResponse.json(
          { error: "No failed or pending targets eligible for retry." },
          { status: 400 }
        );
      }

      for (const t of targets) {
        mockStore.updateTarget(postId, t.platform, {
          status: "queued",
          error_code: null,
          error_message: null,
        });
      }

      mockStore.updatePostStatus(postId, "publishing");

      try {
        await dispatchPostPublishing(postId, platform);
      } catch (err) {
        console.error(`[Retry Dispatch Error post ${postId}]`, err);
      }

      return NextResponse.json({
        success: true,
        message: `Retrying ${targets.length} platform(s)...`,
      });
    }

    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  } catch (error: any) {
    console.error("[Post Retry Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
