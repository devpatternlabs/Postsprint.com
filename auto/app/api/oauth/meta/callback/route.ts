import { NextRequest, NextResponse } from "next/server";
import {
  exchangeMetaCodeForLongLivedToken,
  discoverUserFacebookPages,
  saveMetaConnection,
  savePendingMetaSession,
} from "@/lib/oauth/meta-service";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { sendAccountConnectedEmail } from "@/lib/email/notification-service";

export async function GET(request: NextRequest) {
  let appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  appUrl = appUrl.replace(/\/+$/, "");
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorReason = searchParams.get("error_description") || searchParams.get("error");

  if (errorReason) {
    console.error("[Meta OAuth Callback] Authorization error:", errorReason);
    return NextResponse.redirect(
      new URL(`/connected-accounts?error=${encodeURIComponent(errorReason)}`, appUrl)
    );
  }

  // Verify CSRF state and recover bound user
  let statePayload: { nonce?: string; userId?: string; ts?: number } | null = null;
  try {
    if (state) {
      statePayload = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    }
  } catch {}

  const savedNonce = request.cookies.get("meta_oauth_state")?.value;
  const savedUserId = request.cookies.get("meta_oauth_user_id")?.value;
  const isStateValid =
    (statePayload?.nonce && savedNonce && statePayload.nonce === savedNonce) ||
    (savedNonce && state === savedNonce);

  if (!state || !isStateValid) {
    console.error("[Meta OAuth Callback] CSRF state mismatch or missing");
    return NextResponse.redirect(
      new URL("/connected-accounts?error=Invalid+OAuth+state+parameter", appUrl)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/connected-accounts?error=Missing+authorization+code", appUrl)
    );
  }

  try {
    let user = await getAuthenticatedUser();
    if (!user && (statePayload?.userId || savedUserId)) {
      const boundId = statePayload?.userId || savedUserId;
      const { getAllUsers, setSession } = await import("@/lib/auth/session");
      const matched = getAllUsers().find((u) => u.id === boundId);
      if (matched) {
        user = matched;
        setSession(matched);
      }
    }

    if (!user) {
      return NextResponse.redirect(new URL("/login?error=unauthorized", appUrl));
    }

    // 1. Exchange authorization code for user access token with matching redirect URI
    const callbackRedirectUri = (statePayload as any)?.redirectUri || process.env.META_REDIRECT_URI || `${appUrl}/api/oauth/meta/callback`;
    const { userAccessToken, expiresIn } = await exchangeMetaCodeForLongLivedToken(code, callbackRedirectUri);

    // 2. Discover Facebook Pages managed by the user and inspect linked Instagram
    const pages = await discoverUserFacebookPages(userAccessToken);

    if (!pages || pages.length === 0) {
      console.warn(`[Meta OAuth] No Facebook Pages found for user ${user.id}`);
      return NextResponse.redirect(
        new URL(
          "/connected-accounts?error=" +
            encodeURIComponent(
              "No Facebook Pages found. You must be an administrator of at least one Facebook Page to connect."
            ),
          appUrl
        )
      );
    }

    // 3. Selection Logic:
    // If exactly 1 page exists: save automatically
    // If multiple pages exist: save pending session and prompt user to select
    if (pages.length === 1) {
      const selectedPage = pages[0];
      await saveMetaConnection({
        appUserId: user.id,
        page: selectedPage,
        userAccessToken,
        expiresIn,
      });

      // Send confirmation email asynchronously
      sendAccountConnectedEmail({
        to: user.email,
        platform: "facebook_instagram",
        pageName: selectedPage.name,
        instagramUsername: selectedPage.instagramAccount?.username,
      }).catch((err) => console.warn("[Email Notification Warning]:", err));

      const finalRedirectPath = "/connected-accounts?success=meta_connected";
      const response = NextResponse.redirect(
        new URL(finalRedirectPath, appUrl)
      );
      response.cookies.delete("meta_oauth_state");
      response.cookies.delete("meta_oauth_user_id");
      
      console.log("=== META OAUTH CALLBACK SUCCESS ===");
      console.log("Current logged-in user:", user.email, `(${user.id})`);
      console.log("Final redirect path:", finalRedirectPath);
      console.log("Route being rendered: /connected-accounts");
      console.log("===================================");

      return response;
    } else {
      // Multiple Pages found: store pending session and redirect to accounts with selector trigger
      savePendingMetaSession(user.id, {
        appUserId: user.id,
        userAccessToken,
        expiresIn,
        pages,
        createdAt: Date.now(),
      });

      const finalRedirectPath = "/connected-accounts?select_page=true";
      const response = NextResponse.redirect(
        new URL(finalRedirectPath, appUrl)
      );
      response.cookies.delete("meta_oauth_state");
      response.cookies.delete("meta_oauth_user_id");

      console.log("=== META OAUTH CALLBACK (MULTIPLE PAGES) ===");
      console.log("Current logged-in user:", user.email, `(${user.id})`);
      console.log("Final redirect path:", finalRedirectPath);
      console.log("Route being rendered: /connected-accounts");
      console.log("============================================");

      return response;
    }
  } catch (error: any) {
    console.error("[Meta OAuth Callback Exception]:", error);
    return NextResponse.redirect(
      new URL(
        `/connected-accounts?error=${encodeURIComponent(error?.message || "Failed to complete Meta connection")}`,
        appUrl
      )
    );
  }
}
