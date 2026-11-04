import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken } from "@/lib/encryption/crypto";
import { cookies } from "next/headers";
import { mockStore } from "@/lib/mock-store";
import { SocialAccount } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const { getSession } = require("@/lib/auth/session");
    const appUser = getSession();
    
    let user: any = null;
    if (appUser) {
      user = appUser;
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { token, refreshToken } = await request.json();

    if (!token || token.trim().length === 0) {
      return NextResponse.json(
        { error: "Please provide a valid YouTube access token." },
        { status: 400 }
      );
    }

    const cleanToken = token.trim();

    // Verify token with YouTube Data API
    const ytRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      {
        headers: {
          Authorization: `Bearer ${cleanToken}`,
        },
      }
    );

    const ytData = await ytRes.json();

    if (!ytRes.ok || !ytData.items || ytData.items.length === 0) {
      const errMsg =
        ytData.error?.message ||
        "Could not verify YouTube channel with this token. Make sure you gave permission to your YouTube account.";
      return NextResponse.json({ error: errMsg }, { status: 400 });
    }

    const channel = ytData.items[0];
    const channelId = channel.id;
    const channelTitle = channel.snippet?.title || "My YouTube Channel";
    const channelAvatar = channel.snippet?.thumbnails?.default?.url || null;

    const encryptedAccessToken = encryptToken(cleanToken);
    const encryptedRefreshToken = refreshToken?.trim()
      ? encryptToken(refreshToken.trim())
      : null;

    // 1. Save to Supabase DB if available
    try {
      const admin = createAdminClient();
      await admin.from("social_accounts").upsert(
        {
          user_id: user.id,
          provider: "youtube",
          account_name: channelTitle,
          account_id: channelId,
          youtube_channel_id: channelId,
          encrypted_access_token: encryptedAccessToken,
          encrypted_refresh_token: encryptedRefreshToken,
          token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          metadata: {
            channel_title: channelTitle,
            avatar_url: channelAvatar,
            direct_token: true,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,provider" }
      );
    } catch {
      // Fall through
    }

    // 2. Save to mockStore
    const ytAccount: SocialAccount = {
      id: "real-yt-" + channelId,
      user_id: user.id,
      provider: "youtube",
      account_name: channelTitle,
      account_id: channelId,
      facebook_page_id: null,
      instagram_account_id: null,
      youtube_channel_id: channelId,
      token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      metadata: {
        channel_title: channelTitle,
        avatar_url: channelAvatar,
        raw_access_token: cleanToken,
        direct_token: true,
      },
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    mockStore.disconnectAccount("youtube");
    mockStore.getAccounts().push(ytAccount);

    return NextResponse.json({
      success: true,
      channelTitle,
      channelId,
      channelAvatar,
    });
  } catch (error: any) {
    console.error("[Direct YouTube Token Error]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to connect YouTube token" },
      { status: 500 }
    );
  }
}
