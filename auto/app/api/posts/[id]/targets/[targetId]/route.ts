import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { mockStore } from "@/lib/mock-store";
import { isMockMode } from "@/lib/platforms/mock";
import { deleteFromInstagram } from "@/lib/platforms/instagram";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; targetId: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: postId, targetId } = params;
    const adminSupabase = createAdminClient();

    // 1. Fetch the specific target from DB or Mock Store
    let target: any = null;
    try {
      const { data: dbTarget, error: targetErr } = await adminSupabase
        .from("post_targets")
        .select("*")
        .eq("id", targetId)
        .eq("post_id", postId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!targetErr && dbTarget) {
        target = dbTarget;
      }
    } catch {}

    if (!target) {
      const mockPost = mockStore.getPostById(postId, user.id);
      if (mockPost && mockPost.targets) {
        target = mockPost.targets.find((t: any) => t.id === targetId);
      }
    }

    if (!target) {
      return NextResponse.json({ error: "Target not found" }, { status: 404 });
    }

    // 2. Delete from platform if published
    if (target.status === "published" && target.platform_post_id) {
      const isMockPost = target.platform_post_id.startsWith("mock_") || isMockMode();

      if (target.platform === "facebook") {
        if (!isMockPost) {
          const { getConnectedMetaAccount } = require("@/lib/oauth/meta-service");
          const metaConn = await getConnectedMetaAccount(user.id);
          if (metaConn?.decryptedPageToken) {
            const res = await fetch(
              `https://graph.facebook.com/v21.0/${target.platform_post_id}?access_token=${metaConn.decryptedPageToken}`,
              { method: "DELETE" }
            );
            if (!res.ok) {
              const errText = await res.text();
              return NextResponse.json({ error: `Facebook API Error: ${errText}` }, { status: 400 });
            }
          }
        }
      } else if (target.platform === "youtube") {
        if (!isMockPost) {
          const { getValidYouTubeAccessToken } = require("@/lib/oauth/youtube-service");
          const ytToken = await getValidYouTubeAccessToken(user.id);
          if (ytToken) {
            const res = await fetch(
              `https://www.googleapis.com/youtube/v3/videos?id=${target.platform_post_id}`,
              {
                method: "DELETE",
                headers: { Authorization: `Bearer ${ytToken}` },
              }
            );
            if (!res.ok) {
              const errText = await res.text();
              return NextResponse.json({ error: `YouTube API Error: ${errText}` }, { status: 400 });
            }
          }
        }
      } else if (target.platform === "instagram") {
        if (!isMockPost) {
          const { getConnectedMetaAccount } = require("@/lib/oauth/meta-service");
          const metaConn = await getConnectedMetaAccount(user.id);
          if (metaConn?.decryptedPageToken) {
            const result = await deleteFromInstagram(
              target.platform_post_id,
              metaConn.decryptedPageToken
            );
            if (!result.success) {
              return NextResponse.json(
                { error: `Instagram API Error: ${result.error || "Failed to delete post from Instagram"}` },
                { status: 400 }
              );
            }
          }
        }
      }
    }

    // 3. Remove target from mock store
    mockStore.deleteTarget(postId, targetId);

    // 4. Remove target from Supabase database
    try {
      await adminSupabase
        .from("post_targets")
        .delete()
        .eq("id", targetId);
    } catch {}

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to delete target" },
      { status: 500 }
    );
  }
}
