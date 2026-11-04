import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getGoogleAuthUrl, getRedirectUri } from "@/lib/oauth/google";
import { getAuthenticatedUser } from "@/lib/auth/session";

function getCurrentOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`.replace(/\/+$/, "");
}

export async function GET(request: NextRequest) {
  const origin = getCurrentOrigin(request);
  const searchParams = request.nextUrl.searchParams;
  const returnTo = searchParams.get("return_to") || "/youtube";

  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.redirect(new URL("/login?error=unauthorized", origin));
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        new URL(
          `${returnTo}?error=${encodeURIComponent(
            "Google OAuth is not configured. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
          )}`,
          origin
        )
      );
    }

    // Embed origin, return destination, and verified user id inside state payload
    const rawState = crypto.randomBytes(16).toString("hex");
    const stateObj = {
      nonce: rawState,
      origin,
      returnTo,
      userId: user.id,
      ts: Date.now(),
    };
    const state = Buffer.from(JSON.stringify(stateObj)).toString("base64url");

    // Resolve matching redirect URI (localhost vs production)
    const customRedirectUri = origin.includes("localhost") || origin.includes("127.0.0.1")
      ? `${origin}/api/auth/youtube/callback`
      : undefined;

    const authUrl = getGoogleAuthUrl(state, customRedirectUri);
    const response = NextResponse.redirect(authUrl);

    // Secure HTTP-only cookies for state and return destination
    response.cookies.set("youtube_oauth_state", rawState, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    });

    response.cookies.set("youtube_oauth_return_to", returnTo, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    return response;
  } catch (error: any) {
    console.error("[YouTube OAuth Init Error]", error);
    return NextResponse.redirect(
      new URL(
        `${returnTo}?error=${encodeURIComponent(
          error?.message || "Failed to initiate YouTube connection"
        )}`,
        origin
      )
    );
  }
}
