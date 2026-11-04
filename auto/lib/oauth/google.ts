export const GOOGLE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/youtube", // Full scope to allow DELETE
].join(" ");

export interface GoogleOAuthResult {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scope?: string;
  googleUserId: string | null;
  googleEmail: string | null;
  channelId: string;
  channelTitle: string;
  channelAvatarUrl: string | null;
}

/**
 * Resolves the appropriate OAuth redirect URI.
 */
export function getRedirectUri(customRedirectUri?: string): string {
  if (customRedirectUri) {
    return customRedirectUri;
  }
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI;
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${appUrl}/api/auth/youtube/callback`;
}

/**
 * Builds Google OAuth 2.0 authorization URL.
 */
export function getGoogleAuthUrl(state: string, customRedirectUri?: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = getRedirectUri(customRedirectUri);

  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not configured in environment variables");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchanges authorization code for Google/YouTube tokens and fetches channel & user details.
 */
export async function exchangeGoogleCode(
  code: string,
  customRedirectUri?: string
): Promise<GoogleOAuthResult> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = getRedirectUri(customRedirectUri);

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not configured");
  }

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
    throw new Error(
      tokenData.error_description || tokenData.error || "Failed to exchange Google authorization code"
    );
  }

  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token || null;
  const expiresIn = tokenData.expires_in || 3600;

  // 1. Fetch Google User Profile (Email & ID)
  let googleUserId: string | null = null;
  let googleEmail: string | null = null;
  let userAvatar: string | null = null;

  try {
    const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (userinfoRes.ok) {
      const userInfo = await userinfoRes.json();
      googleUserId = userInfo.sub || null;
      googleEmail = userInfo.email || null;
      userAvatar = userInfo.picture || null;
    }
  } catch (err) {
    console.warn("[Google OAuth] Could not fetch userinfo", err);
  }

  // 2. Retrieve YouTube Channel Information
  const channelRes = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const channelData = await channelRes.json();
  if (!channelRes.ok || !channelData.items || channelData.items.length === 0) {
    throw new Error(
      "No YouTube channel found for this Google account. Please create a YouTube channel first."
    );
  }

  const channel = channelData.items[0];
  const channelTitle = channel.snippet?.title || "My YouTube Channel";
  const channelAvatarUrl =
    channel.snippet?.thumbnails?.high?.url ||
    channel.snippet?.thumbnails?.medium?.url ||
    channel.snippet?.thumbnails?.default?.url ||
    userAvatar;

  return {
    accessToken,
    refreshToken,
    expiresIn,
    scope: tokenData.scope || undefined,
    googleUserId,
    googleEmail,
    channelId: channel.id,
    channelTitle,
    channelAvatarUrl,
  };
}

/**
 * Refreshes an expired Google access token using the stored refresh token.
 */
export async function refreshGoogleAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not configured");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    const errObj = new Error(
      data.error_description || data.error || "Your YouTube connection has expired. Please reconnect your account."
    ) as any;
    errObj.code = data.error; // e.g. "invalid_grant"
    throw errObj;
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 3600,
  };
}

/**
 * Verifies if the access token has the required https://www.googleapis.com/auth/youtube.upload scope.
 */
export async function verifyYouTubeUploadScope(accessToken: string): Promise<{
  hasScope: boolean;
  scopes: string[];
}> {
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`
    );
    if (!res.ok) {
      // If tokeninfo returns an error (e.g. rate limit), do not block if token is valid
      return { hasScope: true, scopes: [] };
    }
    const data = await res.json();
    const scopes: string[] = (data.scope || "").split(" ");
    const hasScope = scopes.some(
      (s) =>
        s.includes("youtube.upload") ||
        s.includes("youtube.force-ssl") ||
        s === "https://www.googleapis.com/auth/youtube"
    );
    return { hasScope, scopes };
  } catch (err) {
    console.warn("[Scope Verification Warning]:", err);
    return { hasScope: true, scopes: [] };
  }
}

