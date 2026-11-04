import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { saveSnapchatConnection } from "@/lib/oauth/snapchat-service";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://socialauto-official.vercel.app";

  if (error || !code) {
    return NextResponse.redirect(
      `${baseUrl}/connected-accounts?error=${encodeURIComponent(
        errorDescription || error || "Snapchat authorization was denied."
      )}`
    );
  }

  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.redirect(`${baseUrl}/login`);
    }

    const clientId = process.env.SNAPCHAT_CLIENT_ID;
    const clientSecret = process.env.SNAPCHAT_CLIENT_SECRET;
    const redirectUri = `${baseUrl}/api/auth/snapchat/callback`;

    if (clientId && clientSecret) {
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const tokenRes = await fetch("https://accounts.snapchat.com/login/oauth2/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }).toString(),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Failed to exchange token with Snapchat: ${errText}`);
      }

      const tokenData = await tokenRes.json();

      await saveSnapchatConnection({
        appUserId: user.id,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresInSeconds: tokenData.expires_in,
        connectionType: "oauth",
      });
    } else {
      // Connect in Creative Kit mode
      await saveSnapchatConnection({
        appUserId: user.id,
        connectionType: "creative_kit",
      });
    }

    return NextResponse.redirect(
      `${baseUrl}/connected-accounts?success=snapchat_connected`
    );
  } catch (err: any) {
    return NextResponse.redirect(
      `${baseUrl}/connected-accounts?error=${encodeURIComponent(
        err?.message || "Failed to complete Snapchat authorization"
      )}`
    );
  }
}
