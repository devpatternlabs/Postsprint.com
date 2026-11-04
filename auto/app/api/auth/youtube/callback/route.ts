import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode, getRedirectUri } from "@/lib/oauth/google";
import { saveYouTubeAccount } from "@/lib/oauth/youtube-service";
import { sendAccountConnectedEmail } from "@/lib/email/notification-service";
import { findOrCreateUser, setSession, getAuthenticatedUser } from "@/lib/auth/session";

function getCurrentOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`.replace(/\/+$/, "");
}

export async function GET(request: NextRequest) {
  const currentOrigin = getCurrentOrigin(request);
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error_description") || searchParams.get("error");

  // Decode state payload if available
  let statePayload: { nonce?: string; origin?: string; returnTo?: string; userId?: string | null; ts?: number } | null = null;
  if (state) {
    try {
      statePayload = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
    } catch {
      statePayload = null;
    }
  }

  const originToUse = statePayload?.origin || currentOrigin;
  const returnTo =
    statePayload?.returnTo ||
    request.cookies.get("youtube_oauth_return_to")?.value ||
    searchParams.get("return_to") ||
    "/youtube";

  // Handle Google OAuth errors / cancellations
  if (errorParam) {
    let friendlyMessage = errorParam;
    if (errorParam === "access_denied" || errorParam.includes("consent")) {
      friendlyMessage = "Google authorization was cancelled by the user.";
    }
    const errorRedirect = new URL(returnTo, originToUse);
    errorRedirect.searchParams.set("error", friendlyMessage);
    const res = NextResponse.redirect(errorRedirect);
    res.cookies.delete("youtube_oauth_state");
    res.cookies.delete("youtube_oauth_return_to");
    return res;
  }

  try {
    // CSRF State validation
    const savedState = request.cookies.get("youtube_oauth_state")?.value;
    const isStateValid =
      (statePayload && statePayload.nonce && savedState && statePayload.nonce === savedState) ||
      (savedState && state === savedState) ||
      (statePayload && statePayload.ts && Date.now() - statePayload.ts < 15 * 60 * 1000);

    if (!state || !isStateValid) {
      console.warn("[YouTube OAuth Callback] State validation warning (expired or cross-domain state)");
    }

    if (!code) {
      const errorRedirect = new URL(returnTo, originToUse);
      errorRedirect.searchParams.set("error", "Missing Google authorization code");
      return NextResponse.redirect(errorRedirect);
    }

    // Exchange authorization code with Google for tokens & channel data
    const customRedirectUri = (originToUse.includes("localhost") || originToUse.includes("127.0.0.1"))
      ? `${originToUse}/api/auth/youtube/callback`
      : undefined;

    const result = await exchangeGoogleCode(code, customRedirectUri);

    const tokenExpiresAt = new Date(Date.now() + result.expiresIn * 1000).toISOString();
    console.log("[YouTube OAuth Callback] Channel connected:", result.channelTitle, `(${result.channelId})`);
    console.log("[YouTube OAuth Callback] refresh token received:", result.refreshToken ? "yes" : "no");
    console.log("[YouTube OAuth Callback] access token expiry:", tokenExpiresAt);

    // Ensure authenticated user exists and matches state
    let user = await getAuthenticatedUser();
    const boundUserId = statePayload?.userId;

    if (!user && boundUserId) {
      // Recover user from local store by bound ID
      const { getAllUsers } = await import("@/lib/auth/session");
      const allUsers = getAllUsers();
      const matched = allUsers.find((u) => u.id === boundUserId);
      if (matched) {
        user = matched;
        setSession(matched);
      }
    }

    if (!user) {
      console.error("[YouTube OAuth Callback] No authenticated user session found for callback");
      const errorRedirect = new URL(returnTo, originToUse);
      errorRedirect.searchParams.set("error", "Unauthorized: Please log in before connecting YouTube.");
      return NextResponse.redirect(errorRedirect);
    }

    // Save tokens and channel metadata strictly for THIS user
    await saveYouTubeAccount({
      userId: user.id,
      channelId: result.channelId,
      channelTitle: result.channelTitle,
      channelAvatarUrl: result.channelAvatarUrl,
      googleEmail: result.googleEmail,
      googleUserId: result.googleUserId,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      grantedScopes: result.scope ? result.scope.split(" ") : undefined,
    });

    // Send confirmation email asynchronously
    sendAccountConnectedEmail({
      to: user.email || result.googleEmail,
      platform: "youtube",
      channelName: result.channelTitle,
      googleEmail: result.googleEmail || undefined,
    }).catch((err) => console.warn("[Email Notification Warning]:", err));

    const successRedirect = new URL(returnTo, originToUse);
    successRedirect.searchParams.set("success", "youtube_connected");
    const response = NextResponse.redirect(successRedirect);

    // Clean up temporary cookies
    response.cookies.delete("youtube_oauth_state");
    response.cookies.delete("youtube_oauth_return_to");

    return response;
  } catch (error: any) {
    console.error("[YouTube OAuth Callback Error]", error);
    const errorRedirect = new URL(returnTo, originToUse);
    errorRedirect.searchParams.set(
      "error",
      error?.message || "Failed to complete YouTube connection."
    );
    return NextResponse.redirect(errorRedirect);
  }
}
