import { cookies } from "next/headers";
import fs from "fs";
import path from "path";
import os from "os";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mockStore } from "@/lib/mock-store";
import { encryptToken, decryptToken } from "@/lib/encryption/crypto";
import { refreshGoogleAccessToken } from "@/lib/oauth/google";
import { SocialAccount } from "@/types";

export interface AuthUser {
  id: string;
  email: string;
}

import { getSession } from "@/lib/auth/session";

/**
 * Resolves the authenticated app user.
 * Tries Supabase session first, then falls back to the local secure session.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  // Try Supabase auth first (if configured)
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && user.id) {
      return {
        id: user.id,
        email: user.email || "",
      };
    }
  } catch {
    // Supabase auth failed or not configured
  }

  // Fallback to secure custom session cookie
  try {
    const appUser = getSession();
    if (appUser) {
      return {
        id: appUser.id,
        email: appUser.email,
      };
    }
  } catch {
    // Session not accessible
  }

  return null;
}

export interface StoredYouTubeConnection {
  appUserId: string;
  googleUserId: string | null;
  email: string | null;
  youtubeChannelId: string;
  youtubeChannelName: string;
  channelProfileImage: string | null;
  accessToken: string; // AES-256 encrypted
  refreshToken: string | null; // AES-256 encrypted (never lost or overwritten with null)
  accessTokenExpiresAt: string; // ISO string
  grantedScopes?: string[];
  connectedAt: string;
  updatedAt: string;
}

const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = IS_SERVERLESS
  ? path.join(os.tmpdir(), "postflow_data")
  : path.join(process.cwd(), ".data");
const YOUTUBE_FILE = path.join(DATA_DIR, "youtube_oauth.json");
const ACCOUNTS_FILE = path.join(DATA_DIR, "social_accounts.json");

/**
 * Ensures persistence directory exists.
 */
function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn("[YouTube Persistence] Could not create data directory:", err);
  }
}

/**
 * Loads all stored YouTube connections from local backend JSON database.
 */
export function getAllStoredYouTubeConnections(): StoredYouTubeConnection[] {
  try {
    ensureDataDir();
    if (fs.existsSync(YOUTUBE_FILE)) {
      const raw = fs.readFileSync(YOUTUBE_FILE, "utf8");
      return JSON.parse(raw) || [];
    }
  } catch (err) {
    console.warn("[YouTube Persistence] Could not read youtube_oauth.json:", err);
  }
  return [];
}

/**
 * Saves all stored YouTube connections to local backend JSON database.
 */
export function saveAllStoredYouTubeConnections(connections: StoredYouTubeConnection[]) {
  try {
    ensureDataDir();
    fs.writeFileSync(YOUTUBE_FILE, JSON.stringify(connections, null, 2), "utf8");
  } catch (err) {
    console.error("[YouTube Persistence] Could not write youtube_oauth.json:", err);
  }
}

/**
 * Retrieves the stored YouTube connection for a specific app user.
 */
export function getStoredYouTubeConnection(userId: string): StoredYouTubeConnection | null {
  if (!userId) return null;
  const all = getAllStoredYouTubeConnections();
  return all.find((c) => c.appUserId === userId) || null;
}

export function getPersistedAccounts(userId?: string): any[] {
  if (!userId) return [];
  try {
    ensureDataDir();
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const content = fs.readFileSync(ACCOUNTS_FILE, "utf8");
      let accounts = JSON.parse(content) || [];
      return accounts.filter((a: any) => a.user_id === userId);
    }
  } catch (err) {
    console.warn("[YouTube Service] Could not read persisted accounts:", err);
  }
  return [];
}

export function savePersistedAccounts(accounts: any[]) {
  try {
    ensureDataDir();
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), "utf8");
  } catch (err) {
    console.warn("[YouTube Service] Could not write persisted accounts:", err);
  }
}

/**
 * Retrieves the connected YouTube account strictly for the authenticated user.
 */
export async function getConnectedYouTubeAccount(
  userId: string
): Promise<{ account: any; connection: StoredYouTubeConnection; isMockStore: boolean } | null> {
  if (!userId) return null;

  // 1. Check local persistent store (.data/youtube_oauth.json)
  const stored = getStoredYouTubeConnection(userId);
  if (stored) {
    return {
      connection: stored,
      account: {
        id: "yt-" + stored.youtubeChannelId,
        user_id: stored.appUserId,
        provider: "youtube",
        account_name: stored.youtubeChannelName,
        account_id: stored.youtubeChannelId,
        youtube_channel_id: stored.youtubeChannelId,
        token_expires_at: stored.accessTokenExpiresAt,
        encrypted_access_token: stored.accessToken,
        encrypted_refresh_token: stored.refreshToken,
        metadata: {
          channel_title: stored.youtubeChannelName,
          avatar_url: stored.channelProfileImage,
          google_email: stored.email,
          google_user_id: stored.googleUserId,
        },
        connected_at: stored.connectedAt,
        updated_at: stored.updatedAt,
      },
      isMockStore: false,
    };
  }

  // 2. Try Supabase DB strictly for this user
  try {
    const admin = createAdminClient();
    const { data: dbAccount } = await admin
      .from("social_accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "youtube")
      .maybeSingle();

    if (dbAccount) {
      const tokenAccess =
        dbAccount.encrypted_access_token || dbAccount.metadata?.encrypted_access_token || "";
      const tokenRefresh =
        dbAccount.encrypted_refresh_token || dbAccount.metadata?.encrypted_refresh_token || null;

      return {
        account: dbAccount,
        connection: {
          appUserId: dbAccount.user_id,
          googleUserId: dbAccount.metadata?.google_user_id || null,
          email: dbAccount.metadata?.google_email || null,
          youtubeChannelId: dbAccount.youtube_channel_id || dbAccount.account_id,
          youtubeChannelName: dbAccount.account_name,
          channelProfileImage: dbAccount.metadata?.avatar_url || null,
          accessToken: tokenAccess,
          refreshToken: tokenRefresh,
          accessTokenExpiresAt: dbAccount.token_expires_at,
          connectedAt: dbAccount.connected_at || new Date().toISOString(),
          updatedAt: dbAccount.updated_at || new Date().toISOString(),
        },
        isMockStore: false,
      };
    }
  } catch {
    // Supabase offline
  }

  // 3. Fallback: check in-memory mockStore strictly for this user
  const mockAcc = mockStore
    .getAccounts(userId)
    .find((a) => a.provider === "youtube" && a.user_id === userId);

  if (mockAcc) {
    return {
      account: mockAcc,
      connection: {
        appUserId: mockAcc.user_id,
        googleUserId: mockAcc.metadata?.google_user_id || null,
        email: mockAcc.metadata?.google_email || null,
        youtubeChannelId: mockAcc.youtube_channel_id || mockAcc.account_id || "",
        youtubeChannelName: mockAcc.account_name || "YouTube Channel",
        channelProfileImage: mockAcc.metadata?.avatar_url || null,
        accessToken: mockAcc.metadata?.encrypted_access_token || "",
        refreshToken: mockAcc.metadata?.encrypted_refresh_token || null,
        accessTokenExpiresAt: mockAcc.token_expires_at || "",
        connectedAt: mockAcc.connected_at || new Date().toISOString(),
        updatedAt: mockAcc.updated_at || new Date().toISOString(),
      },
      isMockStore: true,
    };
  }

  return null;
}

/**
 * Stores or updates a YouTube connection securely.
 * PERMANENTLY preserves existing refreshToken if new one is null/undefined.
 */
export async function saveYouTubeAccount({
  userId,
  channelId,
  channelTitle,
  channelAvatarUrl,
  googleEmail,
  googleUserId,
  accessToken,
  refreshToken,
  expiresIn,
  grantedScopes,
}: {
  userId: string;
  channelId: string;
  channelTitle: string;
  channelAvatarUrl: string | null;
  googleEmail: string | null;
  googleUserId: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  grantedScopes?: string[];
}): Promise<void> {
  const encryptedAccessToken = encryptToken(accessToken);
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Retrieve existing record to PRESERVE refresh token if Google didn't return a new one
  const existingRecord = getStoredYouTubeConnection(userId);

  let finalEncryptedRefreshToken: string | null = null;
  if (refreshToken) {
    finalEncryptedRefreshToken = encryptToken(refreshToken);
    console.log("[YouTube OAuth Service] New refresh token received and saved.");
  } else if (existingRecord && existingRecord.refreshToken) {
    finalEncryptedRefreshToken = existingRecord.refreshToken;
    console.log("[YouTube OAuth Service] Reconnect did not return new refresh token; preserving existing stored refresh token.");
  } else {
    console.warn(
      "[YouTube OAuth Service] Warning: No refresh token returned by Google and none found in existing storage."
    );
  }

  const now = new Date().toISOString();
  const newConnection: StoredYouTubeConnection = {
    appUserId: userId,
    googleUserId: googleUserId || existingRecord?.googleUserId || null,
    email: googleEmail || existingRecord?.email || null,
    youtubeChannelId: channelId,
    youtubeChannelName: channelTitle,
    channelProfileImage: channelAvatarUrl || existingRecord?.channelProfileImage || null,
    accessToken: encryptedAccessToken,
    refreshToken: finalEncryptedRefreshToken,
    accessTokenExpiresAt: tokenExpiresAt,
    grantedScopes: grantedScopes || existingRecord?.grantedScopes,
    connectedAt: existingRecord?.connectedAt || now,
    updatedAt: now,
  };

  // 1. Persist to dedicated YouTube file database
  try {
    const allConnections = getAllStoredYouTubeConnections().filter(
      (c) => c.appUserId !== userId
    );
    allConnections.push(newConnection);
    saveAllStoredYouTubeConnections(allConnections);
    console.log(`[YouTube OAuth Service] Connection persisted to file for channel: ${channelTitle} (user: ${userId})`);
  } catch (fsErr) {
    console.warn("[YouTube OAuth Service] File persist warning:", fsErr);
  }

  // 2. Also persist to social_accounts.json for system-wide dashboard compatibility
  const ytAccount: SocialAccount = {
    id: "yt-" + channelId,
    user_id: userId,
    provider: "youtube",
    account_name: channelTitle,
    account_id: channelId,
    facebook_page_id: null,
    instagram_account_id: null,
    youtube_channel_id: channelId,
    token_expires_at: tokenExpiresAt,
    metadata: {
      channel_title: channelTitle,
      avatar_url: channelAvatarUrl,
      google_email: googleEmail,
      google_user_id: googleUserId,
      encrypted_access_token: encryptedAccessToken,
      encrypted_refresh_token: finalEncryptedRefreshToken,
    },
    connected_at: existingRecord?.connectedAt || now,
    updated_at: now,
  };

  try {
    const persisted = getPersistedAccounts().filter(
      (a) => !(a.user_id === userId && a.provider === "youtube")
    );
    persisted.push({
      ...ytAccount,
      encrypted_access_token: encryptedAccessToken,
      encrypted_refresh_token: finalEncryptedRefreshToken,
    });
    savePersistedAccounts(persisted);
  } catch (fsErr2) {
    console.warn("[YouTube OAuth Service] Accounts file persist warning:", fsErr2);
  }

  // 3. Save to in-memory mockStore
  mockStore.upsertAccount(ytAccount);

  // 4. Try Supabase DB save if configured
  try {
    const admin = createAdminClient();
    
    // Ensure the user exists in profiles table without overwriting existing profile data
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id, email")
      .eq("id", userId)
      .maybeSingle();

    if (!existingProfile) {
      await admin.from("profiles").upsert({
        id: userId,
        email: googleEmail || "user@example.com",
        display_name: channelTitle,
      }, { onConflict: "id" });
    }

    // Check existing social_accounts by channel id or user id to preserve refresh token & avoid primary key collision
    const { data: existingByChannel } = await admin
      .from("social_accounts")
      .select("id, encrypted_refresh_token, metadata")
      .eq("id", "yt-" + channelId)
      .maybeSingle();

    const { data: existingByUser } = await admin
      .from("social_accounts")
      .select("id, encrypted_refresh_token, metadata")
      .eq("user_id", userId)
      .eq("provider", "youtube")
      .maybeSingle();

    const existingDbRow = existingByChannel || existingByUser;
    const preservedRefreshToken =
      finalEncryptedRefreshToken ||
      existingDbRow?.encrypted_refresh_token ||
      existingDbRow?.metadata?.encrypted_refresh_token ||
      null;

    const payload: any = {
      id: "yt-" + channelId,
      user_id: userId,
      provider: "youtube",
      account_name: channelTitle,
      account_id: channelId,
      youtube_channel_id: channelId,
      encrypted_access_token: encryptedAccessToken,
      token_expires_at: tokenExpiresAt,
      metadata: {
        channel_title: channelTitle,
        avatar_url: channelAvatarUrl,
        google_email: googleEmail,
        google_user_id: googleUserId,
        encrypted_access_token: encryptedAccessToken,
        encrypted_refresh_token: preservedRefreshToken,
      },
      updated_at: now,
    };

    if (preservedRefreshToken) {
      payload.encrypted_refresh_token = preservedRefreshToken;
    }

    await admin.from("social_accounts").upsert(payload, { onConflict: "id" });

    // Clean up duplicate row if existingByUser had an older different ID
    if (existingByUser && existingByUser.id !== "yt-" + channelId) {
      await admin.from("social_accounts").delete().eq("id", existingByUser.id);
    }
  } catch (dbErr) {
    console.error("[YouTube OAuth Service] Failed to save to Supabase DB:", dbErr);
  }
}

/**
 * Force refreshes the user's YouTube access token using their stored refresh token.
 */
export async function forceRefreshYouTubeAccessToken(userId: string): Promise<{
  accessToken: string;
  expiresAt: string;
}> {
  console.log(`[YouTube OAuth] token refresh attempted for user: ${userId}`);
  
  const connData = await getConnectedYouTubeAccount(userId);
  if (!connData || !connData.connection || !connData.connection.refreshToken) {
    console.error(`[YouTube OAuth] token refresh failed: No connection or refresh token for user ${userId}`);
    const err = new Error("No refresh token available. Please reconnect YouTube.");
    (err as any).code = "no_refresh_token";
    throw err;
  }

  const record = connData.connection;

  let plainRefreshToken = "";
  try {
    plainRefreshToken = decryptToken(record.refreshToken as string);
  } catch {
    plainRefreshToken = record.refreshToken as string;
  }

  try {
    const refreshed = await refreshGoogleAccessToken(plainRefreshToken);
    const newAccessToken = refreshed.accessToken;
    const newExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();

    console.log(`[YouTube OAuth] token refresh successful. New access token expiry: ${newExpiresAt}`);

    // Update in database preserving existing refresh token
    await saveYouTubeAccount({
      userId,
      channelId: record.youtubeChannelId,
      channelTitle: record.youtubeChannelName,
      channelAvatarUrl: record.channelProfileImage,
      googleEmail: record.email,
      googleUserId: record.googleUserId,
      accessToken: newAccessToken,
      refreshToken: null, // Will preserve existing refreshToken!
      expiresIn: refreshed.expiresIn,
    });

    return {
      accessToken: newAccessToken,
      expiresAt: newExpiresAt,
    };
  } catch (refreshErr: any) {
    console.error(`[YouTube OAuth] token refresh failed:`, refreshErr?.message || refreshErr);
    if (refreshErr?.code === "invalid_grant" || refreshErr?.message?.includes("invalid_grant")) {
      console.warn(`[YouTube OAuth] reason connection was marked disconnected: Refresh token revoked by Google (invalid_grant)`);
      const err = new Error("YouTube authorization was revoked. Please reconnect YouTube.");
      (err as any).code = "invalid_grant";
      throw err;
    }
    throw refreshErr;
  }
}

/**
 * Ensures a valid (non-expired) YouTube access token.
 * Automatically uses the refresh token to renew and save if expired.
 */
export async function getValidYouTubeAccessToken(userId: string): Promise<string> {
  const connData = await getConnectedYouTubeAccount(userId);
  if (!connData || !connData.connection) {
    throw new Error("No YouTube account connected. Please connect YouTube first.");
  }
  
  const record = connData.connection;

  // Check expiration (refresh if within 5 minutes of expiring)
  const expiresAtMs = record.accessTokenExpiresAt
    ? new Date(record.accessTokenExpiresAt).getTime()
    : 0;
  const isExpired = expiresAtMs === 0 || Date.now() + 5 * 60 * 1000 > expiresAtMs;

  if (isExpired && record.refreshToken) {
    console.log(
      `[YouTube OAuth] access token expired or close to expiry (expires: ${record.accessTokenExpiresAt}). Refreshing...`
    );
    const refreshed = await forceRefreshYouTubeAccessToken(userId);
    return refreshed.accessToken;
  }

  try {
    return decryptToken(record.accessToken);
  } catch {
    return record.accessToken;
  }
}

/**
 * Disconnects the YouTube account ONLY on explicit user request.
 */
export async function disconnectYouTubeAccount(userId: string): Promise<void> {
  console.log(`[YouTube Service] User explicitly requested disconnect for user: ${userId}`);

  // 1. Remove from dedicated YouTube file database
  const all = getAllStoredYouTubeConnections().filter((c) => c.appUserId !== userId);
  saveAllStoredYouTubeConnections(all);

  // 2. Remove from social_accounts.json
  const persisted = getPersistedAccounts().filter(
    (a) => !(a.provider === "youtube" && a.user_id === userId)
  );
  savePersistedAccounts(persisted);

  // 3. Remove from mockStore
  mockStore.disconnectAccount("youtube", userId);

  // 4. Remove from Supabase DB
  try {
    const admin = createAdminClient();
    await admin
      .from("social_accounts")
      .delete()
      .eq("user_id", userId)
      .eq("provider", "youtube");
  } catch {
    // Ignored in local dev mode
  }

  console.log(`[YouTube Service] Disconnected and purged credentials for user: ${userId}`);
}

