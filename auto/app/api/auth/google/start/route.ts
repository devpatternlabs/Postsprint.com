import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  let appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  appUrl = appUrl.replace(/\/+$/, ""); // Remove trailing slashes
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return NextResponse.redirect(
      new URL("/login?error=Google+Client+ID+is+not+configured", appUrl)
    );
  }

  // Secure CSRF state
  const state = crypto.randomBytes(24).toString("hex");

  const redirectUri = `${appUrl}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    state,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  const response = NextResponse.redirect(authUrl);

  response.cookies.set("app_login_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
