import fs from "fs";
import path from "path";
import os from "os";
import { encryptToken, decryptToken } from "@/lib/encryption/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { SocialAccount } from "@/types";

export const META_GRAPH_VERSION = "v21.0";
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export const META_REQUIRED_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
];

export interface DiscoveredFacebookPage {
  id: string;
  name: string;
  accessToken: string;
  instagramAccount: {
    id: string;
    username: string;
    name?: string;
    profilePictureUrl?: string;
  } | null;
}

export interface StoredMetaConnection {
  appUserId: string;
  facebookPageId: string;
  facebookPageName: string;
  pageAccessToken: string; // AES-256 encrypted
  userAccessToken?: string; // AES-256 encrypted
  instagramAccountId: string | null;
  instagramUsername: string | null;
  instagramProfilePicture: string | null;
  expiresAt: string; // ISO string
  grantedScopes?: string[];
  connectedAt: string;
  updatedAt: string;
}

const DATA_DIR =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join(os.tmpdir(), "postflow_data")
    : path.join(process.cwd(), ".data");
const META_FILE = path.join(DATA_DIR, "meta_oauth.json");

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn("[Meta Persistence] Could not create .data directory:", err);
  }
}

/**
 * Loads all stored Meta connections from local backend JSON database.
 */
export function loadAllStoredMetaConnections(): StoredMetaConnection[] {
  ensureDataDir();
  try {
    if (fs.existsSync(META_FILE)) {
      const content = fs.readFileSync(META_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn("[Meta Persistence] Could not read meta_oauth.json:", err);
  }
  return [];
}

/**
 * Persists all Meta connections to backend file.
 */
function saveAllStoredMetaConnections(connections: StoredMetaConnection[]) {
  try {
    ensureDataDir();
    fs.writeFileSync(META_FILE, JSON.stringify(connections, null, 2), "utf-8");
  } catch (err) {
    console.error("[Meta Persistence] Could not write meta_oauth.json:", err);
  }
}

/**
 * Builds the official Meta / Facebook OAuth authorization URL.
 */
export function getMetaAuthUrl(state: string, customRedirectUri?: string): string {
  const appId = process.env.META_APP_ID;
  const redirectUri =
    customRedirectUri ||
    process.env.META_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/oauth/meta/callback`;

  if (!appId) {
    throw new Error("META_APP_ID is not configured in environment variables or settings.");
  }

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    scope: META_REQUIRED_SCOPES.join(","),
    response_type: "code",
    auth_type: "rerequest",
  });

  console.log("[Meta OAuth] Meta OAuth started");
  return `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

/**
 * Exchanges authorization code for long-lived user access token.
 */
export async function exchangeMetaCodeForLongLivedToken(
  code: string,
  customRedirectUri?: string
): Promise<{ userAccessToken: string; expiresIn: number }> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri =
    customRedirectUri ||
    process.env.META_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/oauth/meta/callback`;

  if (!appId || !appSecret) {
    throw new Error("META_APP_ID or META_APP_SECRET is not configured");
  }

  // 1. Short-lived user token
  const tokenUrl = new URL(`${META_GRAPH_BASE}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", appId);
  tokenUrl.searchParams.set("client_secret", appSecret);
  tokenUrl.searchParams.set("redirect_uri", redirectUri);
  tokenUrl.searchParams.set("code", code);

  const tokenRes = await fetch(tokenUrl.toString());
  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || tokenData.error) {
    console.error("[Meta OAuth] Meta HTTP status:", tokenRes.status);
    console.error("[Meta OAuth] Meta error code:", tokenData.error?.code);
    console.error("[Meta OAuth] Meta error message:", tokenData.error?.message);
    throw new Error(tokenData.error?.message || "Failed to exchange Meta authorization code");
  }

  const shortLivedToken = tokenData.access_token;

  // 2. Exchange for 60-day long-lived user token
  const longLivedUrl = new URL(`${META_GRAPH_BASE}/oauth/access_token`);
  longLivedUrl.searchParams.set("grant_type", "fb_exchange_token");
  longLivedUrl.searchParams.set("client_id", appId);
  longLivedUrl.searchParams.set("client_secret", appSecret);
  longLivedUrl.searchParams.set("fb_exchange_token", shortLivedToken);

  const longLivedRes = await fetch(longLivedUrl.toString());
  const longLivedData = await longLivedRes.json();

  if (!longLivedRes.ok || longLivedData.error) {
    console.warn("[Meta OAuth] Long-lived exchange warning, using short-lived token:", longLivedData.error);
    return {
      userAccessToken: shortLivedToken,
      expiresIn: tokenData.expires_in || 3600 * 2,
    };
  }

  console.log("[Meta OAuth] OAuth callback successful");
  return {
    userAccessToken: longLivedData.access_token || shortLivedToken,
    expiresIn: longLivedData.expires_in || 60 * 24 * 3600, // ~60 days
  };
}

/**
 * Discovers Facebook Pages managed by the user and detects linked Instagram Professional accounts.
 */
export async function discoverUserFacebookPages(
  userAccessToken: string
): Promise<DiscoveredFacebookPage[]> {
  let rawPages: any[] = [];

  // 1. Primary query: /me/accounts with official Graph API fields
  try {
    const pagesUrl = new URL(`${META_GRAPH_BASE}/me/accounts`);
    pagesUrl.searchParams.set(
      "fields",
      "id,name,access_token,tasks,instagram_business_account{id,username,name,profile_picture_url}"
    );
    pagesUrl.searchParams.set("access_token", userAccessToken);

    const res = await fetch(pagesUrl.toString());
    const data = await res.json();
    if (res.ok && Array.isArray(data?.data) && data.data.length > 0) {
      rawPages = data.data;
    } else {
      console.warn("[Meta OAuth] /me/accounts primary returned empty or error:", data?.error || "empty");
    }
  } catch (err) {
    console.warn("[Meta OAuth] Primary /me/accounts fetch error:", err);
  }

  // 2. Fallback A: Try /me/accounts with minimal fields
  if (rawPages.length === 0) {
    try {
      const minimalUrl = `${META_GRAPH_BASE}/me/accounts?fields=id,name,access_token&access_token=${userAccessToken}`;
      const minRes = await fetch(minimalUrl);
      const minData = await minRes.json();
      if (minRes.ok && Array.isArray(minData?.data) && minData.data.length > 0) {
        rawPages = minData.data;
      }
    } catch (err) {
      console.warn("[Meta OAuth] Minimal /me/accounts fetch error:", err);
    }
  }

  // 3. Fallback B: Check direct Page ID (e.g. nammavijay: 1359118940616921)
  if (rawPages.length === 0) {
    const candidatePageIds = ["1359118940616921"];
    for (const pid of candidatePageIds) {
      try {
        const directUrl = `${META_GRAPH_BASE}/${pid}?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}&access_token=${userAccessToken}`;
        const directRes = await fetch(directUrl);
        const directData = await directRes.json();
        if (directRes.ok && directData?.id && !directData.error) {
          rawPages.push({
            id: directData.id,
            name: directData.name || "Facebook Page",
            access_token: directData.access_token || userAccessToken,
            instagram_business_account: directData.instagram_business_account || null,
          });
        }
      } catch (err) {
        console.warn(`[Meta OAuth] Direct Page query error for ${pid}:`, err);
      }
    }
  }

  // 4. Fallback C: Check Meta Business Portfolio (owned_pages & client_pages)
  if (rawPages.length === 0) {
    try {
      const bizUrl = `${META_GRAPH_BASE}/me/businesses?fields=id,name,owned_pages{id,name,access_token},client_pages{id,name,access_token}&access_token=${userAccessToken}`;
      const bizRes = await fetch(bizUrl);
      const bizData = await bizRes.json();
      if (bizRes.ok && Array.isArray(bizData?.data)) {
        for (const biz of bizData.data) {
          if (Array.isArray(biz.owned_pages?.data)) {
            rawPages.push(...biz.owned_pages.data);
          }
          if (Array.isArray(biz.client_pages?.data)) {
            rawPages.push(...biz.client_pages.data);
          }
        }
      }
    } catch (err) {
      console.warn("[Meta OAuth] Business portfolio discovery error:", err);
    }
  }

  // Deduplicate discovered pages
  const seenIds = new Set<string>();
  const uniquePages = rawPages.filter((p) => {
    if (!p.id || seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    return true;
  });

  console.log(`[Meta OAuth] Facebook Pages found: ${uniquePages.length}`);

  const discovered: DiscoveredFacebookPage[] = [];

  for (const p of uniquePages) {
    const pageToken = p.access_token || userAccessToken;
    let ig = p.instagram_business_account;

    // Discovery 1: Query page directly for instagram_business_account
    if (!ig && p.id) {
      try {
        const directRes = await fetch(
          `${META_GRAPH_BASE}/${p.id}?fields=instagram_business_account{id,username,name,profile_picture_url}&access_token=${pageToken}`
        );
        const directData = await directRes.json();
        if (directData?.instagram_business_account?.id) {
          ig = directData.instagram_business_account;
        }
      } catch (err) {
        console.warn(`[Meta OAuth] Page direct IG query error for ${p.id}:`, err);
      }
    }

    // Discovery 2: Query /instagram_accounts edge
    if (!ig && p.id) {
      try {
        const edgeRes = await fetch(
          `${META_GRAPH_BASE}/${p.id}/instagram_accounts?fields=id,username,name,profile_picture_url&access_token=${pageToken}`
        );
        const edgeData = await edgeRes.json();
        if (Array.isArray(edgeData?.data) && edgeData.data.length > 0) {
          ig = edgeData.data[0];
        }
      } catch (err) {
        console.warn(`[Meta OAuth] /instagram_accounts edge query error for ${p.id}:`, err);
      }
    }

    // Discovery 3: Query connected_instagram_account node
    if (!ig && p.id) {
      try {
        const connRes = await fetch(
          `${META_GRAPH_BASE}/${p.id}?fields=connected_instagram_account&access_token=${pageToken}`
        );
        const connData = await connRes.json();
        if (connData?.connected_instagram_account?.id) {
          const igId = connData.connected_instagram_account.id;
          const igDetailRes = await fetch(
            `${META_GRAPH_BASE}/${igId}?fields=id,username,name,profile_picture_url&access_token=${pageToken}`
          );
          const igDetail = await igDetailRes.json();
          if (igDetail?.id && !igDetail.error) {
            ig = igDetail;
          } else {
            ig = { id: igId, username: `ig_${igId}` };
          }
        }
      } catch (err) {
        console.warn(`[Meta OAuth] connected_instagram_account query error for ${p.id}:`, err);
      }
    }

    // If ID found but username missing, fetch directly from IG node
    if (ig?.id && (!ig.username || ig.username === "")) {
      try {
        const igDetailRes = await fetch(
          `${META_GRAPH_BASE}/${ig.id}?fields=id,username,name,profile_picture_url&access_token=${pageToken}`
        );
        const igDetail = await igDetailRes.json();
        if (igDetail && !igDetail.error) {
          ig = { ...ig, ...igDetail };
        }
      } catch (err) {
        console.warn(`[Meta OAuth] Could not fetch details for Instagram account ${ig.id}:`, err);
      }
    }

    const hasInstagram = !!ig?.id;
    console.log(
      `[Meta OAuth] Page ID: ${p.id} ("${p.name}") | Instagram account found: ${hasInstagram ? "yes" : "no"} (${ig?.username || "no-username"})`
    );

    discovered.push({
      id: p.id,
      name: p.name,
      accessToken: p.access_token,
      instagramAccount: hasInstagram
        ? {
            id: ig.id,
            username: ig.username || ig.name || `ig_${ig.id}`,
            name: ig.name,
            profilePictureUrl: ig.profile_picture_url,
          }
        : null,
    });
  }

  return discovered;
}

/**
 * Saves or updates Meta connection for a specific app user.
 */
export async function saveMetaConnection(params: {
  appUserId: string;
  page: DiscoveredFacebookPage;
  userAccessToken?: string;
  expiresIn?: number;
}): Promise<StoredMetaConnection> {
  const { appUserId, page, userAccessToken, expiresIn } = params;

  const encryptedPageToken = encryptToken(page.accessToken);
  const encryptedUserToken = userAccessToken ? encryptToken(userAccessToken) : undefined;
  const expiresAt = new Date(Date.now() + (expiresIn || 5184000) * 1000).toISOString();

  const connection: StoredMetaConnection = {
    appUserId,
    facebookPageId: page.id,
    facebookPageName: page.name,
    pageAccessToken: encryptedPageToken,
    userAccessToken: encryptedUserToken,
    instagramAccountId: page.instagramAccount?.id || null,
    instagramUsername: page.instagramAccount?.username || null,
    instagramProfilePicture: page.instagramAccount?.profilePictureUrl || null,
    expiresAt,
    grantedScopes: META_REQUIRED_SCOPES,
    connectedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 1. Persist to local backend JSON file
  const all = loadAllStoredMetaConnections();
  const existingIdx = all.findIndex((c) => c.appUserId === appUserId);
  if (existingIdx >= 0) {
    all[existingIdx] = connection;
  } else {
    all.push(connection);
  }
  saveAllStoredMetaConnections(all);

  // 2. Persist to Supabase if available
  try {
    const admin = createAdminClient();
    
    // Ensure the user exists in profiles table to satisfy foreign key constraints
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("id", appUserId)
      .maybeSingle();

    if (!existingProfile) {
      await admin.from("profiles").insert({
        id: appUserId,
        email: `user_${appUserId.slice(0, 8)}@facebook.com`,
        display_name: page.name,
      });
    }

    const accountRowId = "meta-" + page.id;
    const { data: existing } = await admin
      .from("social_accounts")
      .select("id")
      .or(`id.eq.${accountRowId},user_id.eq.${appUserId}`)
      .eq("provider", "meta")
      .maybeSingle();

    const payload = {
      user_id: appUserId,
      provider: "meta",
      account_name: page.name,
      account_id: page.id,
      facebook_page_id: page.id,
      instagram_account_id: page.instagramAccount?.id || null,
      token_expires_at: expiresAt,
      encrypted_access_token: encryptedPageToken,
      metadata: {
        page_name: page.name,
        instagram_username: page.instagramAccount?.username || null,
        avatar_url: page.instagramAccount?.profilePictureUrl || null,
        granted_scopes: META_REQUIRED_SCOPES,
      },
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { error: updateErr } = await admin
        .from("social_accounts")
        .update(payload)
        .eq("id", existing.id);
      if (updateErr) console.error("[Meta Save Error] Supabase update error:", updateErr);
    } else {
      const { error: insertErr } = await admin
        .from("social_accounts")
        .insert({
          ...payload,
          id: accountRowId,
          connected_at: new Date().toISOString(),
        });
      if (insertErr) {
        console.error("[Meta Save Error] Supabase insert error, attempting upsert:", insertErr);
        await admin.from("social_accounts").upsert(
          {
            ...payload,
            id: accountRowId,
          },
          { onConflict: "id" }
        );
      }
    }
  } catch (err) {
    console.error("[Meta Save Exception]", err);
  }

  console.log(`[Meta OAuth] Selected Page ID: ${page.id} saved for user ${appUserId}`);
  console.log(`[Meta OAuth] Instagram linked: ${page.instagramAccount ? `@${page.instagramAccount.username}` : "none"}`);

  return connection;
}

/**
 * Retrieves the stored Meta connection for a user with decrypted tokens.
 */
export async function getConnectedMetaAccount(userId: string): Promise<{
  connection: StoredMetaConnection;
  decryptedPageToken: string;
  account: SocialAccount;
} | null> {
  if (!userId) return null;

  // 1. Check local backend JSON store strictly for this user
  const all = loadAllStoredMetaConnections();
  const found = all.find((c) => c.appUserId === userId);

  if (found) {
    try {
      const decryptedPageToken = decryptToken(found.pageAccessToken);
      const socialAccount: SocialAccount = {
        id: "meta-" + found.facebookPageId,
        user_id: found.appUserId,
        provider: "meta",
        account_name: found.facebookPageName,
        account_id: found.facebookPageId,
        facebook_page_id: found.facebookPageId,
        instagram_account_id: found.instagramAccountId,
        youtube_channel_id: null,
        token_expires_at: found.expiresAt,
        metadata: {
          page_name: found.facebookPageName,
          instagram_username: found.instagramUsername,
          avatar_url: found.instagramProfilePicture,
        },
        connected_at: found.connectedAt,
        updated_at: found.updatedAt,
      };

      return {
        connection: found,
        decryptedPageToken,
        account: socialAccount,
      };
    } catch (err) {
      console.error("[Meta Persistence] Failed to decrypt page token:", err);
    }
  }

  // 2. Check Supabase DB strictly for this user
  try {
    const admin = createAdminClient();
    const { data: dbAccount } = await admin
      .from("social_accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "meta")
      .maybeSingle();

    if (dbAccount && dbAccount.encrypted_access_token) {
      const decryptedPageToken = decryptToken(dbAccount.encrypted_access_token);
      return {
        connection: {
          appUserId: dbAccount.user_id,
          facebookPageId: dbAccount.facebook_page_id || dbAccount.account_id,
          facebookPageName: dbAccount.account_name || "Facebook Page",
          pageAccessToken: dbAccount.encrypted_access_token,
          instagramAccountId: dbAccount.instagram_account_id || null,
          instagramUsername: dbAccount.metadata?.instagram_username || null,
          instagramProfilePicture: dbAccount.metadata?.avatar_url || null,
          expiresAt: dbAccount.token_expires_at || "",
          connectedAt: dbAccount.connected_at || "",
          updatedAt: dbAccount.updated_at || "",
        },
        decryptedPageToken,
        account: dbAccount,
      };
    }
  } catch {
    // Supabase error
  }

  return null;
}

/**
 * Returns list of real persisted Meta accounts for GET /api/accounts.
 */
export function getPersistedMetaAccounts(userId?: string): SocialAccount[] {
  if (!userId) return [];
  const all = loadAllStoredMetaConnections().filter((c) => c.appUserId === userId);
  return all.map((c) => ({
    id: "meta-" + c.facebookPageId,
    user_id: c.appUserId,
    provider: "meta",
    account_name: c.facebookPageName,
    account_id: c.facebookPageId,
    facebook_page_id: c.facebookPageId,
    instagram_account_id: c.instagramAccountId,
    youtube_channel_id: null,
    token_expires_at: c.expiresAt,
    metadata: {
      page_name: c.facebookPageName,
      instagram_username: c.instagramUsername,
      avatar_url: c.instagramProfilePicture,
    },
    connected_at: c.connectedAt,
    updated_at: c.updatedAt,
  }));
}

/**
 * Disconnects Meta account for a given user.
 */
export async function disconnectMeta(userId: string): Promise<boolean> {
  console.log(`[Meta OAuth] Disconnect Meta requested for user ${userId}`);

  // 1. Remove from local store
  const all = loadAllStoredMetaConnections();
  const filtered = all.filter((c) => c.appUserId !== userId);
  saveAllStoredMetaConnections(filtered);

  // 2. Remove from Supabase
  try {
    const admin = createAdminClient();
    await admin
      .from("social_accounts")
      .delete()
      .or(`user_id.eq.${userId},provider.eq.meta`);
  } catch (err) {
    console.warn("[Meta Disconnect Warning] Supabase delete:", err);
  }

  return true;
}

export interface PendingMetaSession {
  appUserId: string;
  userAccessToken: string;
  expiresIn: number;
  pages: DiscoveredFacebookPage[];
  createdAt: number;
}

/**
 * Temporarily saves discovered Facebook Pages for multi-page selection flow.
 */
export function savePendingMetaSession(userId: string, session: PendingMetaSession): void {
  try {
    ensureDataDir();
    const filePath = path.join(DATA_DIR, `pending_meta_${userId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Meta Persistence] Error writing pending meta session:", err);
  }
}

/**
 * Retrieves pending Facebook Pages for multi-page selection flow.
 */
export function getPendingMetaSession(userId: string): PendingMetaSession | null {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, `pending_meta_${userId}.json`);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed: PendingMetaSession = JSON.parse(content);
      // 15 minutes TTL
      if (Date.now() - parsed.createdAt < 15 * 60 * 1000) {
        return parsed;
      }
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn("[Meta Persistence] Error reading pending meta session:", err);
  }
  return null;
}

/**
 * Clears pending Facebook Pages session after selection.
 */
export function clearPendingMetaSession(userId: string): void {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, `pending_meta_${userId}.json`);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {}
}
