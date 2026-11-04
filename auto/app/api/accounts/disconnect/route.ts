import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { disconnectYouTubeAccount } from "@/lib/oauth/youtube-service";
import { disconnectMeta } from "@/lib/oauth/meta-service";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { provider } = await request.json();
    if (!provider || !["meta", "youtube", "snapchat", "sharechat"].includes(provider)) {
      return NextResponse.json(
        { error: "Invalid provider specified" },
        { status: 400 }
      );
    }

    if (provider === "meta") {
      await disconnectMeta(user.id);
    } else if (provider === "youtube") {
      await disconnectYouTubeAccount(user.id);
    } else if (provider === "snapchat") {
      const { disconnectSnapchat } = require("@/lib/oauth/snapchat-service");
      await disconnectSnapchat(user.id);
    } else if (provider === "sharechat") {
      const { disconnectShareChat } = require("@/lib/oauth/sharechat-service");
      await disconnectShareChat(user.id);
    }

    // Also remove from Supabase if active
    try {
      const { createAdminClient } = require("@/lib/supabase/admin");
      const adminSupabase = createAdminClient();
      await adminSupabase
        .from("social_accounts")
        .delete()
        .eq("user_id", user.id)
        .eq("provider", provider);
    } catch {
      // Supabase offline / local mode fallback
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Account Disconnect Route Error]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to disconnect account" },
      { status: 500 }
    );
  }
}
