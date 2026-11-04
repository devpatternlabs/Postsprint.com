import { NextRequest, NextResponse } from "next/server";
import { findOrCreateUser, setSession } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  let appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  appUrl = appUrl.replace(/\/+$/, ""); // Remove trailing slashes
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error_description") || searchParams.get("error");

  if (errorParam) {
    const res = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(errorParam)}`, appUrl));
    res.cookies.delete("app_login_oauth_state");
    return res;
  }

  const savedState = request.cookies.get("app_login_oauth_state")?.value;
  if (!state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL("/login?error=Invalid+security+session", appUrl));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=Missing+authorization+code", appUrl));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${appUrl}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/login?error=Google+Client+ID+or+Secret+missing", appUrl));
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error || "Failed to exchange code");
    }

    const accessToken = tokenData.access_token;

    // Fetch user profile
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profileData = await profileRes.json();

    if (!profileRes.ok || !profileData.id || !profileData.email) {
      throw new Error("Failed to fetch Google user profile");
    }

    // Find or create user
    const appUser = await findOrCreateUser({
      googleId: profileData.id,
      email: profileData.email,
      name: profileData.name || profileData.email.split("@")[0],
      picture: profileData.picture || null,
    });

    // Create session
    setSession(appUser);

    const finalRedirectPath = "/dashboard";
    const response = NextResponse.redirect(new URL(finalRedirectPath, appUrl));
    response.cookies.delete("app_login_oauth_state");

    console.log("=== OAUTH CALLBACK SUCCESS ===");
    console.log("Current logged-in user:", appUser.email, `(${appUser.id})`);
    console.log("Final redirect path:", finalRedirectPath);
    console.log("Route being rendered: /dashboard");
    console.log("===============================");

    return response;
  } catch (error: any) {
    console.error("[Google App Login Error]", error);
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, appUrl));
  }
}
