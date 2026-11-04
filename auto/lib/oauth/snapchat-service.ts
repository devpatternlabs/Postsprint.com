import fs from "fs";
import path from "path";
import os from "os";
import { encryptToken, decryptToken } from "@/lib/encryption/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { SocialAccount } from "@/types";

export interface StoredSnapchatConnection {
  appUserId: string;
  snapchatUserId?: string | null;
  username?: string | null;
  displayName?: string | null;
  profilePictureUrl?: string | null;
  encryptedAccessToken?: string | null;
  encryptedRefreshToken?: string | null;
  expiresAt?: string | null;
  connectionType: "oauth" | "creative_kit";
  connectedAt: string;
  updatedAt: string;
}

const DATA_DIR =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join(os.tmpdir(), "postflow_data")
    : path.join(process.cwd(), ".data");
const SNAPCHAT_FILE = path.join(DATA_DIR, "snapchat_oauth.json");

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn("[Snapchat Persistence] Could not create .data directory:", err);
  }
}

export function loadAllStoredSnapchatConnections(): StoredSnapchatConnection[] {
  ensureDataDir();
  try {
    if (fs.existsSync(SNAPCHAT_FILE)) {
      const content = fs.readFileSync(SNAPCHAT_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn("[Snapchat Persistence] Could not read snapchat_oauth.json:", err);
  }
  return [];
}

export function saveAllStoredSnapchatConnections(connections: StoredSnapchatConnection[]): void {
  ensureDataDir();
  try {
    fs.writeFileSync(SNAPCHAT_FILE, JSON.stringify(connections, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Snapchat Persistence] Could not write snapchat_oauth.json:", err);
  }
}

/**
 * Returns the stored Snapchat connection for a specific app user.
 */
export async function getConnectedSnapchatAccount(
  userId: string
): Promise<{
  connection: StoredSnapchatConnection;
  decryptedAccessToken?: string;
} | null> {
  // 1. Check local secure store
  const all = loadAllStoredSnapchatConnections();
  const found = all.find((c) => c.appUserId === userId);
  if (found) {
    let decryptedAccessToken: string | undefined;
    if (found.encryptedAccessToken) {
      try {
        decryptedAccessToken = decryptToken(found.encryptedAccessToken);
      } catch {}
    }
    return { connection: found, decryptedAccessToken };
  }

  // 2. Check Supabase
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("social_accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "snapchat")
      .maybeSingle();

    if (data) {
      let decryptedAccessToken: string | undefined;
      if (data.encrypted_access_token) {
        try {
          decryptedAccessToken = decryptToken(data.encrypted_access_token);
        } catch {}
      }

      const conn: StoredSnapchatConnection = {
        appUserId: userId,
        snapchatUserId: data.account_id,
        username: data.snapchat_username || data.account_name,
        displayName: data.account_name,
        profilePictureUrl: data.metadata?.profile_picture || null,
        connectionType: data.metadata?.connection_type || "creative_kit",
        connectedAt: data.connected_at,
        updatedAt: data.updated_at,
      };

      return { connection: conn, decryptedAccessToken };
    }
  } catch {}

  return null;
}

/**
 * Persists a Snapchat connection bound to an authenticated app user.
 */
export async function saveSnapchatConnection(params: {
  appUserId: string;
  snapchatUserId?: string;
  username?: string;
  displayName?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresInSeconds?: number;
  connectionType?: "oauth" | "creative_kit";
}): Promise<StoredSnapchatConnection> {
  const now = new Date().toISOString();
  const expiresAt = params.expiresInSeconds
    ? new Date(Date.now() + params.expiresInSeconds * 1000).toISOString()
    : null;

  const encryptedAccessToken = params.accessToken
    ? encryptToken(params.accessToken)
    : null;
  const encryptedRefreshToken = params.refreshToken
    ? encryptToken(params.refreshToken)
    : null;

  const conn: StoredSnapchatConnection = {
    appUserId: params.appUserId,
    snapchatUserId: params.snapchatUserId || `snap_${params.appUserId.slice(-6)}`,
    username: params.username || "Snapchat Creator",
    displayName: params.displayName || params.username || "Snapchat Account",
    encryptedAccessToken,
    encryptedRefreshToken,
    expiresAt,
    connectionType: params.connectionType || (params.accessToken ? "oauth" : "creative_kit"),
    connectedAt: now,
    updatedAt: now,
  };

  // 1. Save locally
  const all = loadAllStoredSnapchatConnections();
  const idx = all.findIndex((c) => c.appUserId === params.appUserId);
  if (idx >= 0) {
    all[idx] = conn;
  } else {
    all.push(conn);
  }
  saveAllStoredSnapchatConnections(all);

  // 2. Upsert in Supabase if accessible
  try {
    const admin = createAdminClient();
    await admin.from("social_accounts").upsert(
      {
        id: `snap_${params.appUserId}`,
        user_id: params.appUserId,
        provider: "snapchat",
        account_name: conn.displayName,
        account_id: conn.snapchatUserId,
        snapchat_username: conn.username,
        encrypted_access_token: encryptedAccessToken || "creative_kit_token",
        encrypted_refresh_token: encryptedRefreshToken,
        token_expires_at: expiresAt,
        metadata: {
          connection_type: conn.connectionType,
        },
        connected_at: now,
        updated_at: now,
      },
      { onConflict: "user_id,provider" }
    );
  } catch (sbErr) {
    console.warn("[Snapchat Persistence] Supabase sync skipped:", sbErr);
  }

  return conn;
}

/**
 * Disconnects Snapchat for the specified user.
 */
export async function disconnectSnapchat(userId: string): Promise<void> {
  // 1. Remove from local store
  const all = loadAllStoredSnapchatConnections().filter((c) => c.appUserId !== userId);
  saveAllStoredSnapchatConnections(all);

  // 2. Remove from Supabase
  try {
    const admin = createAdminClient();
    await admin
      .from("social_accounts")
      .delete()
      .eq("user_id", userId)
      .eq("provider", "snapchat");
  } catch {}
}

export function getPersistedSnapchatAccounts(userId?: string): SocialAccount[] {
  if (!userId) return [];
  const all = loadAllStoredSnapchatConnections();
  const conns = all.filter((c) => c.appUserId === userId);

  return conns.map((c) => ({
    id: `snap_${c.appUserId}`,
    user_id: c.appUserId,
    provider: "snapchat",
    account_name: c.displayName || c.username || "Snapchat Account",
    account_id: c.snapchatUserId || null,
    facebook_page_id: null,
    instagram_account_id: null,
    youtube_channel_id: null,
    snapchat_username: c.username || null,
    token_expires_at: c.expiresAt || null,
    metadata: {
      connection_type: c.connectionType,
    },
    connected_at: c.connectedAt,
    updated_at: c.updatedAt,
  }));
}
