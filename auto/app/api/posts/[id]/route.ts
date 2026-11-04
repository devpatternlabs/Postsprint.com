import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { mockStore } from "@/lib/mock-store";
import { isMockMode } from "@/lib/platforms/mock";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const headers = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };

  try {
    const { id } = params;
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
    }

    try {
      const adminSupabase = createAdminClient();
      const { data: post, error: postErr } = await adminSupabase
        .from("posts")
        .select("*, post_targets(*)")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!postErr && post) {
        return NextResponse.json(
          {
            post: {
              ...post,
              targets: post.post_targets || [],
            },
          },
          { headers }
        );
      }
    } catch {
      // Supabase query error
    }

    const mockPost = mockStore.getPostById(id, user.id);
    if (mockPost) {
      return NextResponse.json({ post: mockPost }, { headers });
    }

    return NextResponse.json({ error: "Post not found" }, { status: 404, headers });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch post details" },
      { status: 500, headers }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    const adminSupabase = createAdminClient();

    // Verify post ownership
    const { data: postData } = await adminSupabase
      .from("posts")
      .select("id, user_id, video_storage_path")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!postData) {
      return NextResponse.json(
        { error: "Post not found or you do not have permission to delete it" },
        { status: 404 }
      );
    }

    const deletePlatforms = request.nextUrl.searchParams.get("deletePlatforms") === "true";

    if (deletePlatforms) {
      const { data: postTargets } = await adminSupabase
        .from("post_targets")
        .select("*")
        .eq("post_id", id)
        .eq("user_id", user.id);

      if (postTargets && postTargets.length > 0) {
        const { getConnectedMetaAccount } = require("@/lib/oauth/meta-service");
        const { getValidYouTubeAccessToken } = require("@/lib/oauth/youtube-service");
        
        const platformErrors: string[] = [];

        for (const target of postTargets) {
          if (target.status !== "published" || !target.platform_post_id) continue;
          
          if (target.platform === "facebook") {
            try {
              const metaConn = await getConnectedMetaAccount(user.id);
              if (metaConn?.decryptedPageToken) {
                const fbRes = await fetch(`https://graph.facebook.com/v21.0/${target.platform_post_id}?access_token=${metaConn.decryptedPageToken}`, {
                  method: "DELETE"
                });
                if (!fbRes.ok) {
                  const errText = await fbRes.text();
                  console.error("FB Delete Error:", errText);
                  platformErrors.push(`Facebook: ${errText}`);
                }
              }
            } catch (err: any) {
              platformErrors.push(`Facebook Exception: ${err.message}`);
            }
          } else if (target.platform === "youtube") {
            try {
              const ytToken = await getValidYouTubeAccessToken(user.id);
              if (ytToken) {
                const ytRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?id=${target.platform_post_id}`, {
                  method: "DELETE",
                  headers: { Authorization: `Bearer ${ytToken}` }
                });
                if (!ytRes.ok) {
                  const errText = await ytRes.text();
                  console.error("YT Delete Error:", errText);
                  platformErrors.push(`YouTube: ${errText}`);
                }
              }
            } catch (err: any) {
              platformErrors.push(`YouTube Exception: ${err.message}`);
            }
          } else if (target.platform === "instagram") {
            try {
              if (target.platform_post_id.startsWith("mock_") || isMockMode()) {
                console.log(`[Post Delete] Mock Instagram media ${target.platform_post_id} deleted.`);
              } else {
                const metaConn = await getConnectedMetaAccount(user.id);
                if (metaConn?.decryptedPageToken) {
                  const { deleteFromInstagram } = require("@/lib/platforms/instagram");
                  const result = await deleteFromInstagram(target.platform_post_id, metaConn.decryptedPageToken);
                  if (!result.success) {
                    console.error("IG Delete Error:", result.error);
                    platformErrors.push(`Instagram: ${result.error}`);
                  }
                }
              }
            } catch (err: any) {
              platformErrors.push(`Instagram Exception: ${err.message}`);
            }
          }
        }

        if (platformErrors.length > 0) {
          return NextResponse.json({ 
            error: "Failed to delete from platforms: \n" + platformErrors.join("\n") 
          }, { status: 400 });
        }
      }
    }

    mockStore.deletePost(id);

    if (postData?.video_storage_path) {
      await adminSupabase.storage
        .from("social-videos")
        .remove([postData.video_storage_path]);
    }

    const { error } = await adminSupabase
      .from("posts")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to delete post" },
      { status: 500 }
    );
  }
}
