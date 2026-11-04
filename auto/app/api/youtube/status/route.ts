import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import {
  getConnectedYouTubeAccount,
  forceRefreshYouTubeAccessToken,
} from "@/lib/oauth/youtube-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };

  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ connected: false }, { headers });
    }

    const connData = await getConnectedYouTubeAccount(user.id);
    if (!connData) {
      return NextResponse.json({ connected: false }, { headers });
    }

    const { connection } = connData;
    const expiresAtMs = connection.accessTokenExpiresAt
      ? new Date(connection.accessTokenExpiresAt).getTime()
      : 0;
    const isExpired = expiresAtMs === 0 || Date.now() + 5 * 60 * 1000 > expiresAtMs;

    if (isExpired && connection.refreshToken) {
      try {
        await forceRefreshYouTubeAccessToken(user.id);
      } catch (refreshErr: any) {
        console.warn("[YouTube Status] Token refresh warning:", refreshErr?.message || refreshErr);
      }
    }

    return NextResponse.json(
      {
        connected: true,
        channel: {
          id: connection.youtubeChannelId,
          title: connection.youtubeChannelName,
          avatarUrl: connection.channelProfileImage,
          email: connection.email,
          googleUserId: connection.googleUserId,
          connectedAt: connection.connectedAt,
        },
        tokenExpiresAt: connection.accessTokenExpiresAt,
      },
      { headers }
    );
  } catch (error: any) {
    console.error("[YouTube Status Exception]", error);
    return NextResponse.json(
      { connected: false, error: error?.message || "Failed to retrieve YouTube status" },
      { status: 500, headers }
    );
  }
}
