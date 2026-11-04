import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getMetaAuthUrl } from "@/lib/oauth/meta-service";
import { getAuthenticatedUser } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  let appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  appUrl = appUrl.replace(/\/+$/, "");

  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.redirect(new URL("/login?error=unauthorized", appUrl));
    }

    const appId = process.env.META_APP_ID;
    if (!appId) {
      return NextResponse.redirect(
        new URL(
          "/connected-accounts?setup=meta&error=Meta+App+ID+is+not+configured.+Please+enter+your+Meta+App+ID+and+Secret+in+API+Credentials.",
          appUrl
        )
      );
    }

    // Generate secure CSRF state with embedded user ID and redirect URI
    const rawNonce = crypto.randomBytes(16).toString("hex");
    const redirectUriUsed = process.env.META_REDIRECT_URI || `${appUrl}/api/oauth/meta/callback`;
    const stateObj = {
      nonce: rawNonce,
      userId: user.id,
      ts: Date.now(),
      redirectUri: redirectUriUsed,
    };
    const state = Buffer.from(JSON.stringify(stateObj)).toString("base64url");
    const authUrl = getMetaAuthUrl(state, redirectUriUsed);

    console.log(`[Meta OAuth] Meta OAuth started for user ${user.id}. Redirect URI: ${redirectUriUsed}`);

    const response = NextResponse.redirect(authUrl);

    // Save state and bound user ID in secure HTTP-only cookies
    response.cookies.set("meta_oauth_state", rawNonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    });

    response.cookies.set("meta_oauth_user_id", user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    return response;
  } catch (error: any) {
    console.error("[Meta OAuth Start Error]", error);
    return NextResponse.redirect(
      new URL(
        `/connected-accounts?error=${encodeURIComponent(error?.message || "Failed to initiate Meta connection")}`,
        appUrl
      )
    );
  }
}
