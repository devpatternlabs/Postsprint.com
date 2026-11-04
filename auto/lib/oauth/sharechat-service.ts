import fs from "fs";
import path from "path";
import os from "os";
import { encryptToken, decryptToken } from "@/lib/encryption/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { SocialAccount } from "@/types";

export interface StoredShareChatConnection {
  appUserId: string;
  shareChatUserId?: string | null;
  handle?: string | null;
  displayName?: string | null;
  encryptedPartnerToken?: string | null;
  connectionType: "partner_api" | "manual_share";
  connectedAt: string;
  updatedAt: string;
}

const DATA_DIR =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join(os.tmpdir(), "postflow_data")
    : path.join(process.cwd(), ".data");
const SHARECHAT_FILE = path.join(DATA_DIR, "sharechat_oauth.json");

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn("[ShareChat Persistence] Could not create .data directory:", err);
  }
}

export function loadAllStoredShareChatConnections(): StoredShareChatConnection[] {
  ensureDataDir();
  try {
    if (fs.existsSync(SHARECHAT_FILE)) {
      const content = fs.readFileSync(SHARECHAT_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn("[ShareChat Persistence] Could not read sharechat_oauth.json:", err);
  }
  return [];
}

export function saveAllStoredShareChatConnections(connections: StoredShareChatConnection[]): void {
  ensureDataDir();
  try {
    fs.writeFileSync(SHARECHAT_FILE, JSON.stringify(connections, null, 2), "utf-8");
  } catch (err) {
    console.warn("[ShareChat Persistence] Could not write sharechat_oauth.json:", err);
  }
}

export async function getConnectedShareChatAccount(
  userId: string
): Promise<{
  connection: StoredShareChatConnection;
  decryptedPartnerToken?: string;
} | null> {
  const all = loadAllStoredShareChatConnections();
  const found = all.find((c) => c.appUserId === userId);
  if (found) {
    let decryptedPartnerToken: string | undefined;
    if (found.encryptedPartnerToken) {
      try {
        decryptedPartnerToken = decryptToken(found.encryptedPartnerToken);
      } catch {}
    }
    return { connection: found, decryptedPartnerToken };
  }

  // Check Supabase
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("social_accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "sharechat")
      .maybeSingle();

    if (data) {
      let decryptedPartnerToken: string | undefined;
      if (data.encrypted_access_token) {
        try {
          decryptedPartnerToken = decryptToken(data.encrypted_access_token);
        } catch {}
      }

      const conn: StoredShareChatConnection = {
        appUserId: userId,
        shareChatUserId: data.account_id,
        handle: data.sharechat_handle || data.account_name,
        displayName: data.account_name,
        connectionType: data.metadata?.connection_type || "manual_share",
        connectedAt: data.connected_at,
        updatedAt: data.updated_at,
      };

      return { connection: conn, decryptedPartnerToken };
    }
  } catch {}

  return null;
}

export async function saveShareChatConnection(params: {
  appUserId: string;
  handle?: string;
  displayName?: string;
  partnerToken?: string;
  connectionType?: "partner_api" | "manual_share";
}): Promise<StoredShareChatConnection> {
  const now = new Date().toISOString();
  const encryptedPartnerToken = params.partnerToken
    ? encryptToken(params.partnerToken)
    : null;

  const conn: StoredShareChatConnection = {
    appUserId: params.appUserId,
    shareChatUserId: `sc_${params.appUserId.slice(-6)}`,
    handle: params.handle || "ShareChat Creator",
    displayName: params.displayName || params.handle || "ShareChat",
    encryptedPartnerToken,
    connectionType: params.connectionType || (params.partnerToken ? "partner_api" : "manual_share"),
    connectedAt: now,
    updatedAt: now,
  };

  const all = loadAllStoredShareChatConnections();
  const idx = all.findIndex((c) => c.appUserId === params.appUserId);
  if (idx >= 0) {
    all[idx] = conn;
  } else {
    all.push(conn);
  }
  saveAllStoredShareChatConnections(all);

  try {
    const admin = createAdminClient();
    await admin.from("social_accounts").upsert(
      {
        id: `sc_${params.appUserId}`,
        user_id: params.appUserId,
        provider: "sharechat",
        account_name: conn.displayName,
        account_id: conn.shareChatUserId,
        sharechat_handle: conn.handle,
        encrypted_access_token: encryptedPartnerToken || "manual_share_token",
        metadata: {
          connection_type: conn.connectionType,
        },
        connected_at: now,
        updated_at: now,
      },
      { onConflict: "user_id,provider" }
    );
  } catch (sbErr) {
    console.warn("[ShareChat Persistence] Supabase sync skipped:", sbErr);
  }

  return conn;
}

export async function disconnectShareChat(userId: string): Promise<void> {
  const all = loadAllStoredShareChatConnections().filter((c) => c.appUserId !== userId);
  saveAllStoredShareChatConnections(all);

  try {
    const admin = createAdminClient();
    await admin
      .from("social_accounts")
      .delete()
      .eq("user_id", userId)
      .eq("provider", "sharechat");
  } catch {}
}

export function getPersistedShareChatAccounts(userId?: string): SocialAccount[] {
  if (!userId) return [];
  const all = loadAllStoredShareChatConnections();
  const conns = all.filter((c) => c.appUserId === userId);

  return conns.map((c) => ({
    id: `sc_${c.appUserId}`,
    user_id: c.appUserId,
    provider: "sharechat",
    account_name: c.displayName || c.handle || "ShareChat Account",
    account_id: c.shareChatUserId || null,
    facebook_page_id: null,
    instagram_account_id: null,
    youtube_channel_id: null,
    sharechat_handle: c.handle || null,
    token_expires_at: null,
    metadata: {
      connection_type: c.connectionType,
    },
    connected_at: c.connectedAt,
    updated_at: c.updatedAt,
  }));
}
