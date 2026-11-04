import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { mockStore } from "@/lib/mock-store";
import { isMockMode } from "@/lib/platforms/mock";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const headers = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };

  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
    }

    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get("mode");

    try {
      const adminSupabase = createAdminClient();
      let query = adminSupabase
        .from("posts")
        .select("*, post_targets(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (mode === "scheduled") {
        query = query.eq("post_mode", "scheduled");
      }

      const { data: posts, error } = await query;
      if (!error && posts) {
        const formatted = posts.map((p: any) => ({
          ...p,
          targets: p.post_targets || [],
        }));
        return NextResponse.json({ posts: formatted }, { headers });
      }
    } catch {
      // Supabase query error - fallback to local scoped store
    }

    let posts = mockStore.getPosts(user.id);
    if (mode === "scheduled") {
      posts = posts.filter((p) => p.post_mode === "scheduled");
    }
    return NextResponse.json({ posts }, { headers });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch posts" },
      { status: 500, headers }
    );
  }
}
