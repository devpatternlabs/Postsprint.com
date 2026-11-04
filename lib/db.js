// lib/db.js
// Postmint Unified Database Layer: Supabase PostgREST with Resilient Local Fallback
// Provides persistent storage for Social Accounts, Scheduled Posts, and Publishing Targets

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { encryptToken, decryptToken } = require('./crypto');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://oadiscrojgfsszedilwp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const loggedEmailsMemoryCache = new Set(['explorewithharizz@gmail.com']);
let adminOverviewCache = null;
let adminOverviewCacheTime = 0;

function getDbPath() {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const tmpPath = path.join('/tmp', 'postmint-db.json');
    if (!fs.existsSync(tmpPath)) {
      try {
        const seedPath = path.join(__dirname, '..', 'postmint-db.json');
        if (fs.existsSync(seedPath)) {
          fs.copyFileSync(seedPath, tmpPath);
        }
      } catch (e) {}
    }
    return tmpPath;
  }
  return path.join(__dirname, '..', 'postmint-db.json');
}

function loadLocalDb() {
  let data = null;
  try {
    const dbFile = getDbPath();
    if (fs.existsSync(dbFile)) {
      data = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    }
  } catch (e) {
    console.error('[DB] Failed to read db file:', e.message);
  }
  if (!data) data = {};

  if (!Array.isArray(data.users)) data.users = [];
  if (!Array.isArray(data.socialAccounts)) data.socialAccounts = [];
  if (!Array.isArray(data.posts)) data.posts = [];
  if (!Array.isArray(data.postTargets)) data.postTargets = [];
  if (!Array.isArray(data.subscriptions)) data.subscriptions = [];
  if (!Array.isArray(data.usage)) data.usage = [];
  if (!Array.isArray(data.coupons)) data.coupons = [];
  if (!Array.isArray(data.coupon_redemptions)) data.coupon_redemptions = [];
  if (!Array.isArray(data.free_members)) data.free_members = [];
  if (!Array.isArray(data.otp_codes)) data.otp_codes = [];
  if (!Array.isArray(data.activity_logs)) data.activity_logs = [];
  if (!Array.isArray(data.payments)) data.payments = [];
  if (!Array.isArray(data.sessions)) data.sessions = [];
  if (!Array.isArray(data.notifications)) data.notifications = [];
  if (!Array.isArray(data.logged_emails)) data.logged_emails = [];
  if (!Array.isArray(data.contact_inquiries)) data.contact_inquiries = [];

  // Seed default admin user: explorewithharizz@gmail.com
  const adminEmail = 'explorewithharizz@gmail.com';
  if (!data.logged_emails.includes(adminEmail)) data.logged_emails.push(adminEmail);
  let admin = data.users.find(u => (u.email || '').toLowerCase() === adminEmail);
  if (!admin) {
    admin = {
      id: 'usr_admin_harizz',
      email: adminEmail,
      email_normalized: adminEmail,
      name: 'Harizz (Admin)',
      avatar_url: 'https://api.dicebear.com/7.x/initials/svg?seed=Harizz&backgroundColor=2563eb',
      auth_provider: 'google',
      role: 'admin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_login: new Date().toISOString(),
      onboarding_completed: true,
      account_status: 'active',
      status: 'active',
      signup_logged: true
    };
    data.users.unshift(admin);
  } else {
    admin.role = 'admin';
    admin.status = 'active';
    admin.email_normalized = adminEmail;
  }

  // Seed coupon CODE (100% Free Creator Pro for 14 days)
  if (!data.coupons.some(c => (c.code || '').toUpperCase() === 'CODE')) {
    data.coupons.push({
      id: 'cpn_code_welcome',
      code: 'CODE',
      discount_type: 'free',
      discount_value: 100,
      valid_from: '2026-10-01T00:00:00.000Z',
      valid_until: '2027-12-31T23:59:59.000Z',
      max_uses: null,
      uses_count: 0,
      uses_per_user: 1,
      applicable_plan: 'creator_pro',
      premium_duration_days: 14,
      active: true,
      created_at: new Date().toISOString()
    });
  }

  // Seed coupon HARIZZ (Requirement 31: 100% Free Creator Pro for 14 days)
  if (!data.coupons.some(c => (c.code || '').toUpperCase() === 'HARIZZ')) {
    data.coupons.push({
      id: 'cpn_harizz_welcome',
      code: 'HARIZZ',
      discount_type: 'free',
      discount_value: 100,
      valid_from: '2026-10-01T00:00:00.000Z',
      valid_until: '2027-12-31T23:59:59.000Z',
      max_uses: null,
      uses_count: 0,
      uses_per_user: 1,
      applicable_plan: 'creator_pro',
      premium_duration_days: 14,
      active: true,
      created_at: new Date().toISOString()
    });
  }

  // Seed coupon HARIZZ20
  if (!data.coupons.some(c => (c.code || '').toUpperCase() === 'HARIZZ20')) {
    data.coupons.push({
      id: 'cpn_harizz20',
      code: 'HARIZZ20',
      discount_type: 'percentage',
      discount_value: 20,
      valid_from: '2026-10-01T00:00:00.000Z',
      valid_until: '2027-12-31T23:59:59.000Z',
      max_uses: 500,
      uses_count: 0,
      uses_per_user: 1,
      applicable_plan: 'all',
      premium_duration_days: 0,
      active: true,
      created_at: new Date().toISOString()
    });
  }

  return data;
}

function saveLocalDb(data) {
  try {
    const dbFile = getDbPath();
    fs.writeFileSync(dbFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[DB] Failed to save db file:', e.message);
  }
}

async function supabaseFetch(endpoint, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'User-Agent': 'Postmint-Backend/1.0',
    ...(options.headers || {})
  };

  const res = await fetch(url, { ...options, headers });
  return res;
}

// Supabase Storage JSON persistence layer for serverless multi-instance sync
const storageCache = {};
const STORAGE_CACHE_TTL_MS = 3000;

async function loadStorageJson(key, defaultValue = []) {
  const now = Date.now();
  if (storageCache[key] && (now - (storageCache[key + '_time'] || 0) < STORAGE_CACHE_TTL_MS)) {
    return storageCache[key];
  }
  try {
    const url = `${SUPABASE_URL}/storage/v1/object/authenticated/social-videos/_config/${key}.json`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'User-Agent': 'Postmint-Backend/1.0'
      }
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        storageCache[key] = data;
        storageCache[key + '_time'] = now;
        return data;
      }
    }
  } catch (e) {
    console.warn(`[DB Storage] loadStorageJson failed for ${key}:`, e.message);
  }
  return defaultValue;
}

async function saveStorageJson(key, data) {
  storageCache[key] = data;
  storageCache[key + '_time'] = Date.now();
  try {
    const url = `${SUPABASE_URL}/storage/v1/object/social-videos/_config/${key}.json`;
    await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Postmint-Backend/1.0',
        'x-upsert': 'true'
      },
      body: JSON.stringify(data)
    });
  } catch (e) {
    console.warn(`[DB Storage] saveStorageJson failed for ${key}:`, e.message);
  }
}

// Ensure user profile exists in Supabase
let adminProfileEnsured = false;
async function ensureUserProfile(userId = 'usr_admin_harizz') {
  if (!userId) return;
  if (userId === 'usr_admin_harizz' || userId === 'usr_default_postmint') {
    if (adminProfileEnsured && userId === 'usr_admin_harizz') return;
    try {
      await supabaseFetch('profiles', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          id: userId,
          email: userId === 'usr_admin_harizz' ? 'explorewithharizz@gmail.com' : 'default@postmint.io',
          display_name: userId === 'usr_admin_harizz' ? 'Harizz (Admin)' : 'Postmint User',
          timezone: 'UTC',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      });
      if (userId === 'usr_admin_harizz') adminProfileEnsured = true;
    } catch (e) {}
    return;
  }

  // For any other user, ensure their profile with THEIR actual email and name
  try {
    const data = loadLocalDb();
    let user = (data.users || []).find(u => u.id === userId);
    if (!user) {
      const storageUsers = await loadStorageJson('users', []);
      user = (storageUsers || []).find(u => u.id === userId);
    }
    if (user && user.email) {
      await supabaseFetch('profiles', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          id: userId,
          email: user.email,
          display_name: user.name || user.email.split('@')[0],
          timezone: 'UTC',
          updated_at: new Date().toISOString()
        })
      });
    }
  } catch (e) {
    console.warn('[DB] ensureUserProfile warning:', e.message);
  }
}

const db = {
  // =========================================================================
  // 1. Social Accounts Management
  // =========================================================================

  async getConnectedAccounts(userId) {
    if (!userId) return [];

    const mapRowToAccounts = (acc) => {
      // Exclude namadhavijay / nammavijay / nammaaweb accounts as requested
      const accStr = JSON.stringify(acc).toLowerCase();
      if (accStr.includes('namadha') || accStr.includes('vijay') || accStr.includes('nammaaweb') || acc.facebook_page_id === '1359118940616921' || acc.id === 'meta-1359118940616921' || acc.youtube_channel_id === 'UCMv475gkLL4dT3EKeh4afhg' || acc.account_id === 'UCMv475gkLL4dT3EKeh4afhg' || acc.id === 'sa_youtube_UCMv475gkLL4dT3EKeh4afhg') {
        return [];
      }
      const results = [];
      const plat = (acc.provider || acc.platform || 'meta').toLowerCase();
      if (plat === 'meta') {
        const fbExternalId = acc.facebook_page_id || acc.account_id || acc.externalId || 'meta_fb';
        results.push({
          id: acc.id || `sa_facebook_${fbExternalId}`,
          userId: acc.user_id || acc.userId,
          platform: 'facebook',
          externalId: fbExternalId,
          pageId: acc.facebook_page_id || acc.account_id || acc.externalId || null,
          pageName: acc.metadata?.page_name || acc.account_name || acc.pageName || acc.displayName || 'Facebook Page',
          displayName: acc.metadata?.page_name || acc.account_name || acc.displayName || 'Facebook Page',
          avatarUrl: acc.metadata?.avatar_url || acc.avatarUrl || null,
          expiresAt: acc.token_expires_at || acc.expiresAt,
          scopes: acc.metadata?.granted_scopes || acc.scopes || [],
          status: 'active',
          createdAt: acc.connected_at || acc.createdAt
        });
        if (acc.instagram_account_id || acc.instagramAccountId) {
          results.push({
            id: `ig_${acc.id || acc.instagram_account_id}`,
            userId: acc.user_id || acc.userId,
            platform: 'instagram',
            externalId: acc.instagram_account_id || acc.instagramAccountId,
            pageId: acc.facebook_page_id || null,
            pageName: acc.account_name || null,
            displayName: acc.metadata?.instagram_username ? `@${acc.metadata.instagram_username}` : (acc.account_name ? `@${acc.account_name}` : 'Instagram Professional'),
            avatarUrl: acc.metadata?.avatar_url || acc.avatarUrl || null,
            expiresAt: acc.token_expires_at || acc.expiresAt,
            scopes: acc.metadata?.granted_scopes || acc.scopes || [],
            status: 'active',
            createdAt: acc.connected_at || acc.createdAt
          });
        }
      } else {
        results.push({
          id: acc.id,
          userId: acc.user_id || acc.userId,
          platform: plat,
          externalId: acc.account_id || acc.externalId || acc.facebook_page_id || acc.instagram_account_id || acc.youtube_channel_id,
          pageId: acc.facebook_page_id || acc.pageId || null,
          pageName: acc.account_name || acc.pageName || null,
          displayName: acc.account_name || acc.displayName || `${plat} Account`,
          avatarUrl: acc.metadata?.avatar_url || acc.avatarUrl || null,
          expiresAt: acc.token_expires_at || acc.expiresAt,
          scopes: acc.metadata?.granted_scopes || acc.scopes || [],
          status: 'active',
          createdAt: acc.connected_at || acc.createdAt
        });
      }
      return results;
    };

    // Collect all candidate user IDs for this user
    const candidateUserIds = new Set([userId]);
    const adminIds = ['usr_admin_harizz', 'usr_default_postmint', 'usr_3ce0fa0bec4108552ac755ba', 'usr_7922d573f3242095', 'usr_851ad5fa3c3a4f89', 'usr_23da82fc2fa543dc', 'usr_7be7f11c817293b8', 'usr_bf9478a767d282f0', 'usr_admin_harizz_alt', 'admin'];
    let isCurrentAdmin = adminIds.includes(userId);

    try {
      const user = await this.findUserById(userId);
      const email = user?.email || user?.email_normalized;
      if (user && user.role === 'admin') isCurrentAdmin = true;
      if (email) {
        const normEmail = email.trim().toLowerCase();
        if (normEmail === 'explorewithharizz@gmail.com' || normEmail === 'devpatternlabs@gmail.com') {
          isCurrentAdmin = true;
        }
        const profRes = await supabaseFetch(`profiles?email=eq.${encodeURIComponent(normEmail)}&select=id`);
        if (profRes.ok) {
          const profRows = await profRes.json();
          if (Array.isArray(profRows)) {
            profRows.forEach(p => { if (p.id) candidateUserIds.add(p.id); });
          }
        }
      }
    } catch (_) {}

    if (isCurrentAdmin) {
      adminIds.forEach(id => candidateUserIds.add(id));
      candidateUserIds.add('usr_1e0685b1f89f4072');
      candidateUserIds.add('usr_76884c5c0c3cb809');
    }

    // Try Supabase first
    try {
      const idsArray = Array.from(candidateUserIds);
      const queryFilter = idsArray.length === 1
        ? `user_id=eq.${encodeURIComponent(idsArray[0])}`
        : `user_id=in.(${idsArray.join(',')})`;

      let res = await supabaseFetch(`social_accounts?${queryFilter}&select=*`);
      let rows = res.ok ? await res.json() : [];

      if (!rows || rows.length === 0) {
        // Fallback: check if stored under usr_default_postmint
        const defRes = await supabaseFetch(`social_accounts?user_id=eq.usr_default_postmint&select=*`);
        if (defRes.ok) {
          const defRows = await defRes.json();
          if (defRows && defRows.length > 0) rows = defRows;
        }
      }

      if (rows && rows.length > 0) {
        let allMapped = [];
        for (const row of rows) {
          allMapped = allMapped.concat(mapRowToAccounts(row));
        }
        const isPlatformDisconnected = (plat) => {
          if (!plat) return false;
          const pKey = plat.toLowerCase();
          const disc = loadLocalDb().disconnectedPlatforms || {};
          return Boolean(disc[`${userId}_${pKey}`] || disc[`usr_default_postmint_${pKey}`]);
        };
        const deduped = [];
        const seen = new Set();
        for (const a of allMapped) {
          if (isPlatformDisconnected(a.platform)) continue;
          const key = `${a.platform}_${a.externalId || a.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            deduped.push(a);
          }
        }
        return deduped;
      }
    } catch (e) {
      console.warn('[DB] Supabase getConnectedAccounts fallback to local:', e.message);
    }

    // Local DB Fallback
    const data = loadLocalDb();
    const isPlatformDisconnected = (plat) => {
      if (!plat) return false;
      const pKey = plat.toLowerCase();
      const disc = data.disconnectedPlatforms || {};
      return Boolean(disc[`${userId}_${pKey}`] || disc[`usr_default_postmint_${pKey}`]);
    };
    let accounts = (data.socialAccounts || []).filter(acc => (candidateUserIds.has(acc.userId) || acc.userId === 'usr_default_postmint') && acc.status !== 'revoked' && !isPlatformDisconnected(acc.platform));
    let localMapped = [];
    for (const acc of accounts) {
      localMapped = localMapped.concat(mapRowToAccounts(acc));
    }
    const dedupedLocal = [];
    const seenLocal = new Set();
    for (const a of localMapped) {
      if (isPlatformDisconnected(a.platform)) continue;
      const key = `${a.platform}_${a.externalId || a.id}`;
      if (!seenLocal.has(key)) {
        seenLocal.add(key);
        dedupedLocal.push(a);
      }
    }
    return dedupedLocal;
  },

  async getAccountWithTokens(id, userId = null) {
    // Try Supabase first
    try {
      const isIgPrefix = typeof id === 'string' && id.startsWith('ig_');
      const searchId = isIgPrefix ? id.replace(/^ig_/, '') : id;

      const adminIds = ['usr_admin_harizz', 'usr_default_postmint', 'usr_3ce0fa0bec4108552ac755ba', 'usr_7922d573f3242095', 'usr_851ad5fa3c3a4f89', 'usr_23da82fc2fa543dc', 'usr_7be7f11c817293b8', 'admin'];
      const isPrivileged = !userId || adminIds.includes(userId);
      const userClause = (!isPrivileged && userId) ? '&user_id=eq.' + encodeURIComponent(userId) : '';
      let res = await supabaseFetch(`social_accounts?id=eq.${encodeURIComponent(searchId)}${userClause}&select=*`);
      let rows = res.ok ? await res.json() : [];
      if (!rows || rows.length === 0) {
        // If query by external ID / account_id
        const altRes = await supabaseFetch(`social_accounts?account_id=eq.${encodeURIComponent(searchId)}${userClause}&select=*`);
        if (altRes.ok) rows = await altRes.json();
      }
      if (!rows || rows.length === 0) {
        const fallbackRes = await supabaseFetch('social_accounts?id=eq.' + encodeURIComponent(searchId) + '&select=*');
        if (fallbackRes.ok) rows = await fallbackRes.json();
        if (!rows || rows.length === 0) {
          const fallbackAlt = await supabaseFetch('social_accounts?account_id=eq.' + encodeURIComponent(searchId) + '&select=*');
          if (fallbackAlt.ok) rows = await fallbackAlt.json();
        }
      }
      if (rows && rows.length > 0) {
        const acc = rows[0];

        // Exclude namadhavijay / nammavijay / nammaaweb accounts
        const accStr = JSON.stringify(acc).toLowerCase();
        if (accStr.includes('namadha') || accStr.includes('vijay') || accStr.includes('nammaaweb') || acc.facebook_page_id === '1359118940616921' || acc.id === 'meta-1359118940616921' || acc.youtube_channel_id === 'UCMv475gkLL4dT3EKeh4afhg' || acc.account_id === 'UCMv475gkLL4dT3EKeh4afhg' || acc.id === 'sa_youtube_UCMv475gkLL4dT3EKeh4afhg') {
          return null;
        }

        let accessToken = null;
        let refreshToken = null;
        if (acc.encrypted_access_token) {
          try { accessToken = decryptToken(acc.encrypted_access_token); } catch {}
        }
        if (acc.encrypted_refresh_token) {
          try { refreshToken = decryptToken(acc.encrypted_refresh_token); } catch {}
        }

        if (isIgPrefix || acc.provider === 'instagram') {
          return {
            id,
            userId: acc.user_id,
            platform: 'instagram',
            externalId: acc.instagram_account_id || acc.account_id,
            pageId: acc.facebook_page_id || null,
            pageName: acc.account_name || null,
            displayName: acc.metadata?.instagram_username ? `@${acc.metadata.instagram_username}` : (acc.account_name ? `@${acc.account_name}` : 'Instagram Professional'),
            avatarUrl: acc.metadata?.avatar_url || null,
            expiresAt: acc.token_expires_at,
            scopes: acc.metadata?.granted_scopes || [],
            accessToken,
            refreshToken
          };
        }

        return {
          id: acc.id,
          userId: acc.user_id,
          platform: acc.provider,
          externalId: acc.account_id || acc.facebook_page_id || acc.instagram_account_id || acc.youtube_channel_id,
          pageId: acc.facebook_page_id || null,
          pageName: acc.account_name || null,
          displayName: acc.account_name || `${acc.provider} Account`,
          avatarUrl: acc.metadata?.avatar_url || null,
          expiresAt: acc.token_expires_at,
          scopes: acc.metadata?.granted_scopes || [],
          accessToken,
          refreshToken
        };
      }
    } catch (e) {
      console.warn('[DB] Supabase getAccountWithTokens fallback to local:', e.message);
    }

    // Local DB Fallback (Scoped strictly to user unless admin)
    const data = loadLocalDb();
    let acc = (data.socialAccounts || []).find(a => (a.id === id || a.externalId === id) && (!userId || userId === 'admin' || a.userId === userId));
    if (!acc) return null;

    let accessToken = null;
    let refreshToken = null;
    if (acc.accessTokenEnc) {
      try { accessToken = decryptToken(acc.accessTokenEnc); } catch {}
    }
    if (acc.refreshTokenEnc) {
      try { refreshToken = decryptToken(acc.refreshTokenEnc); } catch {}
    }

    return {
      ...acc,
      accessToken,
      refreshToken
    };
  },

  async upsertSocialAccount({
    userId = 'usr_default_postmint',
    platform,
    externalId,
    displayName,
    avatarUrl,
    accessToken,
    refreshToken,
    expiresAt,
    scopes = []
  }) {
    await ensureUserProfile(userId);

    const data = loadLocalDb();
    data.disconnectedPlatforms = data.disconnectedPlatforms || {};
    const platKey = (platform || '').toLowerCase();
    delete data.disconnectedPlatforms[`${userId}_${platKey}`];
    delete data.disconnectedPlatforms[`usr_default_postmint_${platKey}`];
    const existingIndex = (data.socialAccounts || []).findIndex(
      acc => acc.userId === userId && acc.platform === platform && acc.externalId === externalId
    );
    const existingAcc = existingIndex >= 0 ? data.socialAccounts[existingIndex] : null;

    // Preserve existing encrypted tokens if new token is not provided
    const accessTokenEnc = accessToken 
      ? encryptToken(accessToken) 
      : (existingAcc?.accessTokenEnc || null);
    const refreshTokenEnc = refreshToken 
      ? encryptToken(refreshToken) 
      : (existingAcc?.refreshTokenEnc || null);
    // In Supabase, provider check constraint strictly enforces ('meta', 'youtube').
    // Both Facebook Pages and Instagram Accounts map to provider 'meta' with their respective IDs
    const isMeta = platform === 'facebook' || platform === 'instagram' || platform === 'meta';
    const provider = isMeta ? 'meta' : platform.toLowerCase();
    const accountId = `sa_${provider}_${externalId || Date.now()}`;

    // 1. Persist to Supabase
    try {
      const sbRecord = {
        id: accountId,
        user_id: userId,
        provider: provider,
        account_name: displayName || `${platform.toUpperCase()} Account`,
        account_id: externalId || null,
        facebook_page_id: (platform === 'facebook' || isMeta) ? externalId : null,
        instagram_account_id: platform === 'instagram' ? externalId : null,
        youtube_channel_id: platform === 'youtube' ? externalId : null,
        token_expires_at: expiresAt || null,
        metadata: {
          avatar_url: avatarUrl || null,
          platform_type: platform,
          granted_scopes: Array.isArray(scopes) ? scopes : [scopes]
        },
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      if (accessTokenEnc) sbRecord.encrypted_access_token = accessTokenEnc;
      if (refreshTokenEnc) sbRecord.encrypted_refresh_token = refreshTokenEnc;

      const res = await supabaseFetch('social_accounts', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(sbRecord)
      });
      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[DB] Supabase upsertSocialAccount warning (${res.status}):`, errText);
      }
    } catch (sbErr) {
      console.warn('[DB] Supabase upsertSocialAccount warning:', sbErr.message);
    }

    // 2. Mirror to Local DB
    const accountRecord = {
      id: existingAcc ? existingAcc.id : accountId,
      userId,
      platform,
      externalId,
      displayName: displayName || `${platform.toUpperCase()} Account`,
      avatarUrl: avatarUrl || null,
      accessTokenEnc,
      refreshTokenEnc,
      expiresAt: expiresAt || null,
      scopes: Array.isArray(scopes) ? scopes : [scopes],
      status: 'active',
      createdAt: existingAcc ? existingAcc.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!data.socialAccounts) data.socialAccounts = [];
    if (existingIndex >= 0) {
      data.socialAccounts[existingIndex] = accountRecord;
    } else {
      data.socialAccounts.push(accountRecord);
    }
    saveLocalDb(data);

    const { accessTokenEnc: _a, refreshTokenEnc: _r, ...sanitized } = accountRecord;
    return sanitized;
  },

  async disconnectSocialAccount(id, userId, platform) {
    const data = loadLocalDb();
    data.disconnectedPlatforms = data.disconnectedPlatforms || {};

    let targetPlat = (platform || '').toLowerCase();
    if (!targetPlat && id) {
      if (id.includes('youtube') || id.startsWith('yt_') || id.startsWith('sa_youtube')) targetPlat = 'youtube';
      else if (id.includes('facebook') || id.startsWith('fb_') || id.startsWith('sa_facebook')) targetPlat = 'facebook';
      else if (id.includes('instagram') || id.startsWith('ig_') || id.startsWith('sa_instagram')) targetPlat = 'instagram';
    }

    if (targetPlat) {
      if (userId) data.disconnectedPlatforms[`${userId}_${targetPlat}`] = Date.now();
      data.disconnectedPlatforms[`usr_default_postmint_${targetPlat}`] = Date.now();
    }

    try {
      const filters = [];
      if (id) {
        filters.push(`social_accounts?id=eq.${encodeURIComponent(id)}`);
        filters.push(`social_accounts?account_id=eq.${encodeURIComponent(id)}`);
        filters.push(`social_accounts?youtube_channel_id=eq.${encodeURIComponent(id)}`);
        filters.push(`social_accounts?facebook_page_id=eq.${encodeURIComponent(id)}`);
        filters.push(`social_accounts?instagram_account_id=eq.${encodeURIComponent(id)}`);
      }
      if (targetPlat) {
        if (userId) filters.push(`social_accounts?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(targetPlat)}`);
        filters.push(`social_accounts?user_id=eq.usr_default_postmint&provider=eq.${encodeURIComponent(targetPlat)}`);
      }
      for (const filter of filters) {
        try {
          await supabaseFetch(filter, { method: 'DELETE' });
        } catch (_) {}
      }
    } catch (e) {}

    data.socialAccounts = (data.socialAccounts || []).filter(acc => {
      const matchId = id && (acc.id === id || acc.externalId === id);
      const matchPlat = targetPlat && acc.platform && acc.platform.toLowerCase() === targetPlat && (!userId || acc.userId === userId || acc.userId === 'usr_default_postmint');
      return !(matchId || matchPlat);
    });
    saveLocalDb(data);
    return true;
  },

  // =========================================================================
  // 2. Scheduled Posts & Targets Management (Server-Side Persistence)
  // =========================================================================

  /**
   * Persists a newly scheduled post to Supabase and local cache
   */
  async saveScheduledPost({
    id,
    userId = 'usr_default_postmint',
    title = '',
    caption = '',
    hashtags = '',
    type = 'Post',
    ratio = '1:1',
    platforms = [],
    scheduledAt,
    timezone = 'UTC',
    storagePath,
    mediaUrl,
    filename = 'media.mp4',
    size = 1024,
    mediaId,
    thumbnailUrl = null,
    thumbnailStoragePath = null,
    thumbnailFit = 'cover',
    thumbnailPosition = 'center'
  }) {
    await ensureUserProfile(userId);

    const postId = id || crypto.randomUUID();
    const fullCaption = [caption, hashtags].filter(Boolean).join('\n\n');
    const safeScheduledAt = new Date(scheduledAt).toISOString();
    const cleanStoragePath = storagePath || `posts/${postId}_${Date.now()}.mp4`;
    const cleanFilename = filename || (cleanStoragePath.split('/').pop() || 'media.mp4');

    // 1. Insert into Supabase `posts`
    let supabasePostSaved = false;
    try {
      const postRecord = {
        id: postId,
        user_id: userId,
        caption: fullCaption,
        youtube_title: title || caption.slice(0, 70) || 'Postmint Post',
        video_storage_path: cleanStoragePath,
        video_filename: cleanFilename,
        video_size: Math.max(1, parseInt(size) || 1024),
        post_mode: 'scheduled',
        scheduled_at: safeScheduledAt,
        timezone: timezone || 'UTC',
        status: 'queued',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const res = await supabaseFetch('posts', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(postRecord)
      });

      if (res.ok) {
        supabasePostSaved = true;
      } else {
        const errTxt = await res.text();
        console.warn('[DB] Supabase post insert failed, using fallback:', errTxt);
      }
    } catch (err) {
      console.warn('[DB] Supabase post insert exception:', err.message);
    }

    // 2. Insert into Supabase `post_targets`
    const targetRecords = [];
    for (const plat of platforms) {
      const targetId = `tgt_${crypto.randomBytes(8).toString('hex')}`;
      const targetRecord = {
        id: targetId,
        post_id: postId,
        user_id: userId,
        platform: plat.toLowerCase(),
        status: 'queued',
        attempt_count: 0,
        updated_at: new Date().toISOString()
      };
      targetRecords.push(targetRecord);

      if (supabasePostSaved) {
        try {
          await supabaseFetch('post_targets', {
            method: 'POST',
            headers: { 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify(targetRecord)
          });
        } catch (tErr) {
          console.warn('[DB] Target insert warning:', tErr.message);
        }
      }
    }

    // 3. Mirror into Local Database
    const localDb = loadLocalDb();
    if (!localDb.posts) localDb.posts = [];
    if (!localDb.postTargets) localDb.postTargets = [];

    const localPost = {
      id: postId,
      userId,
      title: title || caption.slice(0, 60),
      caption,
      hashtags,
      type,
      ratio,
      platforms,
      status: 'Scheduled',
      date: safeScheduledAt,
      scheduledAt: safeScheduledAt,
      storagePath: cleanStoragePath,
      mediaUrl: mediaUrl || null,
      mediaId: mediaId || null,
      thumbnailUrl: thumbnailUrl || null,
      thumbnailStoragePath: thumbnailStoragePath || null,
      thumbnailFit: thumbnailFit || 'cover',
      thumbnailPosition: thumbnailPosition || 'center',
      metrics: { reach: 0, likes: 0, clicks: 0 },
      results: [],
      error: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const existingIdx = localDb.posts.findIndex(p => p.id === postId);
    if (existingIdx >= 0) {
      localDb.posts[existingIdx] = localPost;
    } else {
      localDb.posts.unshift(localPost);
    }

    // Mirror targets locally
    targetRecords.forEach(tr => {
      localDb.postTargets.push(tr);
    });

    saveLocalDb(localDb);

    return {
      success: true,
      post: localPost
    };
  },

  /**
   * Persists a published or processing post to Supabase and local cache
   */
  async savePublishedPost({
    id,
    userId = 'usr_default_postmint',
    title = '',
    caption = '',
    hashtags = '',
    type = 'Post',
    ratio = '1:1',
    platforms = [],
    results = [],
    storagePath = null,
    mediaUrl = null,
    status = 'Published'
  }) {
    await ensureUserProfile(userId);
    const postId = id || crypto.randomUUID();
    const fullCaption = [caption, hashtags].filter(Boolean).join('\n\n');
    const nowIso = new Date().toISOString();

    const anySuccess = results.some(r => r.success || r.videoId || r.postId);
    const anyProcessing = results.some(r => r.status === 'processing' || r.processing_status === 'processing' || r.ready === false);
    const allSuccess = results.length > 0 && results.every(r => r.success || r.videoId || r.postId);
    const sbStatus = allSuccess ? 'completed' : (anyProcessing ? 'publishing' : (anySuccess ? 'completed' : 'failed'));
    const finalClientStatus = (status === 'Processing' || anyProcessing) ? 'Processing' : (anySuccess ? 'Published' : 'Failed');

    try {
      await supabaseFetch('posts', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          id: postId,
          user_id: userId,
          caption: fullCaption,
          youtube_title: title || caption.slice(0, 70) || 'Postmint Post',
          video_storage_path: storagePath || null,
          post_mode: 'now',
          status: sbStatus,
          updated_at: nowIso,
          created_at: nowIso
        })
      });
    } catch (e) {}

    for (const r of results) {
      try {
        const isTargetProc = r.status === 'processing' || r.processing_status === 'processing' || r.ready === false;
        const targetSbStatus = (r.success || r.videoId || r.postId) ? (isTargetProc ? 'processing' : 'published') : 'failed';
        await supabaseFetch('post_targets', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify({
            id: `tgt_${crypto.randomBytes(8).toString('hex')}`,
            post_id: postId,
            user_id: userId,
            platform: (r.platform || 'facebook').toLowerCase(),
            status: targetSbStatus,
            platform_post_id: r.postId || r.videoId || null,
            platform_url: r.url || null,
            error_message: r.error || null,
            updated_at: nowIso
          })
        });
      } catch (e) {}
    }

    const localDb = loadLocalDb();
    if (!localDb.posts) localDb.posts = [];
    const localPost = {
      id: postId,
      userId,
      title: title || caption.slice(0, 60),
      caption,
      hashtags,
      type: type || 'Post',
      ratio: ratio || '1:1',
      platforms: platforms || [],
      status: finalClientStatus,
      date: nowIso,
      storagePath: storagePath || null,
      mediaUrl: mediaUrl || null,
      storageCleaned: Boolean(!storagePath),
      results: results || [],
      metrics: { reach: results.filter(r => r.success).length * 20, likes: 0, clicks: 0 },
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const existingIdx = localDb.posts.findIndex(p => p.id === postId);
    if (existingIdx >= 0) {
      localDb.posts[existingIdx] = { ...localDb.posts[existingIdx], ...localPost };
    } else {
      localDb.posts.unshift(localPost);
    }
    saveLocalDb(localDb);

    return localPost;
  },

  /**
   * Fetches due scheduled posts whose scheduled_at <= now()
   */
  async getDueScheduledPosts() {
    const nowIso = new Date().toISOString();
    const duePosts = [];
    const seenIds = new Set();

    // 1. Query Supabase
    try {
      const res = await supabaseFetch(`posts?status=eq.queued&post_mode=eq.scheduled&scheduled_at=lte.${nowIso}&order=scheduled_at.asc`);
      if (res.ok) {
        const rows = await res.json();
        for (const r of rows) {
          // Fetch targets for this post
          const tRes = await supabaseFetch(`post_targets?post_id=eq.${r.id}`);
          const targets = tRes.ok ? await tRes.json() : [];
          const plats = targets.length > 0
            ? targets.map(t => t.platform.charAt(0).toUpperCase() + t.platform.slice(1))
            : ['Facebook'];

          seenIds.add(r.id);
          let localMatch = null;
          try {
            const ldb = loadLocalDb();
            localMatch = (ldb.posts || []).find(p => p.id === r.id);
          } catch(e) {}
          duePosts.push({
            id: r.id,
            userId: r.user_id,
            title: r.youtube_title || r.caption?.slice(0, 60) || 'Scheduled Post',
            caption: r.caption || '',
            storagePath: r.video_storage_path,
            scheduledAt: r.scheduled_at,
            date: r.scheduled_at,
            platforms: plats,
            targets: targets,
            status: 'Scheduled',
            thumbnailUrl: localMatch?.thumbnailUrl || null,
            thumbnailStoragePath: localMatch?.thumbnailStoragePath || null,
            thumbnailFit: localMatch?.thumbnailFit || 'cover',
            thumbnailPosition: localMatch?.thumbnailPosition || 'center'
          });
        }
      }
    } catch (sbErr) {
      console.warn('[DB] Supabase getDueScheduledPosts warning:', sbErr.message);
    }

    // 2. Query Local DB fallback
    try {
      const localDb = loadLocalDb();
      const localDue = (localDb.posts || []).filter(p =>
        (p.status === 'Scheduled' || p.status === 'queued') &&
        new Date(p.date || p.scheduledAt) <= new Date() &&
        !seenIds.has(p.id)
      );

      for (const lp of localDue) {
        duePosts.push(lp);
      }
    } catch (locErr) {
      console.warn('[DB] Local DB getDueScheduledPosts warning:', locErr.message);
    }

    return duePosts;
  },

  /**
   * Atomically claims a scheduled post for publishing (concurrency-safe lock)
   */
  async claimPostForPublishing(postId) {
    const nowIso = new Date().toISOString();

    // Attempt atomic update in Supabase
    try {
      const patchRes = await supabaseFetch(`posts?id=eq.${postId}&status=eq.queued`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({
          status: 'publishing',
          updated_at: nowIso
        })
      });

      if (patchRes.ok) {
        const updated = await patchRes.json();
        if (updated && updated.length > 0) {
          console.log(`[DB Lock] Successfully claimed post ${postId} via Supabase atomic update!`);
          const localDb = loadLocalDb();
          const p = (localDb.posts || []).find(x => x.id === postId);
          if (p) {
            p.status = 'Publishing';
            p.updatedAt = nowIso;
            saveLocalDb(localDb);
          }
          return true;
        }
      }
    } catch (e) {
      console.warn('[DB Lock] Supabase claim warning:', e.message);
    }

    // Local DB atomic lock fallback if Supabase was unreachable
    const localDb = loadLocalDb();
    const p = (localDb.posts || []).find(x => x.id === postId);
    if (p && (p.status === 'Scheduled' || p.status === 'queued')) {
      p.status = 'Publishing';
      p.updatedAt = nowIso;
      saveLocalDb(localDb);
      console.log(`[DB Lock] Claimed post ${postId} via local DB lock!`);
      return true;
    }

    return false;
  },

  /**
   * Updates an individual platform target record
   */
  async updatePostTarget(targetId, updateData = {}) {
    const nowIso = new Date().toISOString();
    try {
      await supabaseFetch(`post_targets?id=eq.${targetId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...updateData,
          updated_at: nowIso
        })
      });
    } catch (e) {}

    // Update local DB
    const localDb = loadLocalDb();
    const t = (localDb.postTargets || []).find(x => x.id === targetId);
    if (t) {
      Object.assign(t, updateData, { updated_at: nowIso });
      saveLocalDb(localDb);
    }
  },

  /**
   * Finalizes post status based on platform targets (completed, partial, or failed)
   */
  async finalizePostStatus(postId, { results = [], error = '' } = {}) {
    const nowIso = new Date().toISOString();
    const anySuccess = results.some(r => r.success);
    const allSuccess = results.length > 0 && results.every(r => r.success);

    const sbStatus = allSuccess ? 'completed' : anySuccess ? 'partial' : 'failed';
    const clientStatus = allSuccess ? 'Published' : anySuccess ? 'Published' : 'Failed';

    try {
      const patchBody = {
        status: sbStatus,
        updated_at: nowIso
      };
      if (allSuccess) {
        patchBody.video_storage_path = null;
      }
      await supabaseFetch(`posts?id=eq.${postId}`, {
        method: 'PATCH',
        body: JSON.stringify(patchBody)
      });
    } catch (e) {}

    const localDb = loadLocalDb();
    const p = (localDb.posts || []).find(x => x.id === postId);
    if (p) {
      p.status = clientStatus;
      p.results = results;
      p.publishedAt = nowIso;
      p.error = error;
      p.updatedAt = nowIso;
      if (allSuccess) {
        p.storagePath = null;
        p.mediaUrl = null;
        p.storageCleaned = true;
      }
      if (allSuccess || anySuccess) {
        p.metrics = {
          reach: (results.filter(r => r.success).length) * 20,
          likes: 0,
          clicks: 0
        };
      }
      saveLocalDb(localDb);
    }

    return { status: clientStatus, sbStatus };
  },

  /**
   * Retrieves all posts with their targets
   */
  async getAllPosts(userId = null) {
    if (!userId) return [];
    const postsMap = new Map();
    const candidateUserIds = new Set();
    candidateUserIds.add(userId);

    const adminIds = ['usr_admin_harizz', 'usr_default_postmint', 'usr_3ce0fa0bec4108552ac755ba', 'usr_7922d573f3242095', 'usr_851ad5fa3c3a4f89', 'usr_23da82fc2fa543dc', 'usr_7be7f11c817293b8', 'usr_bf9478a767d282f0', 'usr_admin_harizz_alt', 'admin'];
    let isCurrentAdmin = adminIds.includes(userId);
    try {
      const u = await this.findUserById(userId);
      if (u && (u.role === 'admin' || (u.email || '').trim().toLowerCase() === 'explorewithharizz@gmail.com' || (u.email || '').trim().toLowerCase() === 'devpatternlabs@gmail.com')) {
        isCurrentAdmin = true;
      }
    } catch (_) {}

    if (isCurrentAdmin) {
      adminIds.forEach(id => candidateUserIds.add(id));
      candidateUserIds.add('usr_ac030f3d71a3802b89e458e1');
      candidateUserIds.add('usr_08b8b3328ced89597f0589e7');
    }

    const localDbObj = loadLocalDb();
    const deletedIds = new Set(localDbObj.deletedPostIds || []);

    // 1. Fetch from Supabase
    try {
      const idsArray = Array.from(candidateUserIds);
      const queryFilter = idsArray.length === 1
        ? `user_id=eq.${encodeURIComponent(idsArray[0])}`
        : `user_id=in.(${idsArray.join(',')})`;
      const res = await supabaseFetch(`posts?${queryFilter}&order=created_at.desc`);
      if (res.ok) {
        const rows = await res.json();
        for (const r of rows) {
          if (!r || !r.id || deletedIds.has(r.id)) continue;
          const tRes = await supabaseFetch(`post_targets?post_id=eq.${r.id}`);
          const targets = tRes.ok ? await tRes.json() : [];
          const plats = targets.length > 0
            ? targets.map(t => t.platform.charAt(0).toUpperCase() + t.platform.slice(1))
            : ['Facebook'];

          const anyTargetPublished = targets.some(t => t.status === 'published' || t.platform_post_id);
          const anyTargetProcessing = targets.some(t => t.status === 'processing' || t.status === 'pending');
          const clientStatus = (r.status === 'completed' || r.status === 'partial' || r.status === 'published' || anyTargetPublished)
            ? 'Published'
            : (r.status === 'queued')
            ? 'Scheduled'
            : (r.status === 'publishing' || anyTargetProcessing)
            ? 'Processing'
            : (r.status === 'failed')
            ? 'Failed'
            : 'Draft';

          postsMap.set(r.id, {
            id: r.id,
            userId: r.user_id,
            title: r.youtube_title || r.caption?.slice(0, 60) || 'Untitled Post',
            caption: r.caption,
            platforms: plats,
            type: 'Post',
            ratio: '1:1',
            status: clientStatus,
            date: r.scheduled_at || r.created_at,
            storagePath: r.video_storage_path,
            results: targets.map(t => ({
              platform: t.platform.charAt(0).toUpperCase() + t.platform.slice(1),
              success: t.status === 'published',
              status: t.status,
              postId: t.platform_post_id,
              url: t.platform_url,
              error: t.error_message
            })),
            metrics: { reach: targets.filter(t => t.status === 'published').length * 20, likes: 0, clicks: 0 },
            error: targets.find(t => t.error_message)?.error_message || '',
            createdAt: r.created_at,
            updatedAt: r.updated_at
          });
        }
      }
    } catch (e) {
      console.warn('[DB] Supabase getAllPosts warning:', e.message);
    }

    // 2. Merge with Local DB ONLY for this user
    const localDb = localDbObj;
    for (const lp of (localDb.posts || [])) {
      if (deletedIds.has(lp.id)) continue;
      const lpUid = lp.userId || lp.user_id;
      if (!lpUid || (!candidateUserIds.has(lpUid) && lpUid !== userId)) continue;
      if (!postsMap.has(lp.id)) {
        postsMap.set(lp.id, lp);
      } else {
        // Overlay any extra local client media attributes
        const existing = postsMap.get(lp.id);
        if (lp.mediaId) existing.mediaId = lp.mediaId;
        if (lp.mediaUrl) existing.mediaUrl = lp.mediaUrl;
        if (lp.type) existing.type = lp.type;
        if (lp.ratio) existing.ratio = lp.ratio;
        if (lp.status && (lp.status === 'Processing' || lp.status === 'Uploading') && existing.status === 'Draft') {
          existing.status = lp.status;
          existing.progress = lp.progress;
          existing.uploadPct = lp.uploadPct;
        }
      }
    }

    return Array.from(postsMap.values()).filter(p => !deletedIds.has(p.id) && (candidateUserIds.has(p.userId) || candidateUserIds.has(p.user_id) || p.userId === userId || p.user_id === userId));
  },

  /**
   * Retrieves a single post by ID, scoped to user if userId provided
   */
  async getPostById(postId, userId = null) {
    if (!postId) return null;
    const localDb = loadLocalDb();
    const deletedIds = new Set(localDb.deletedPostIds || []);
    if (deletedIds.has(postId)) return null;

    try {
      const query = userId ? `posts?id=eq.${encodeURIComponent(postId)}&user_id=eq.${encodeURIComponent(userId)}` : `posts?id=eq.${encodeURIComponent(postId)}`;
      const res = await supabaseFetch(query);
      if (res.ok) {
        const rows = await res.json();
        if (rows && rows.length > 0) {
          const r = rows[0];
          const tRes = await supabaseFetch(`post_targets?post_id=eq.${encodeURIComponent(r.id)}`);
          const targets = tRes.ok ? await tRes.json() : [];
          const plats = targets.length > 0
            ? targets.map(t => t.platform.charAt(0).toUpperCase() + t.platform.slice(1))
            : ['Facebook'];

          const anyTargetPublished = targets.some(t => t.status === 'published' || t.platform_post_id);
          const clientStatus = (r.status === 'completed' || r.status === 'partial' || r.status === 'published' || anyTargetPublished)
            ? 'Published'
            : r.status === 'queued'
            ? 'Scheduled'
            : r.status === 'publishing'
            ? 'Publishing'
            : r.status === 'failed'
            ? 'Failed'
            : 'Draft';

          return {
            id: r.id,
            userId: r.user_id,
            title: r.youtube_title || r.caption?.slice(0, 60) || 'Untitled Post',
            caption: r.caption,
            platforms: plats,
            type: 'Post',
            ratio: '1:1',
            status: clientStatus,
            date: r.scheduled_at || r.created_at,
            storagePath: r.video_storage_path,
            results: targets.map(t => ({
              platform: t.platform.charAt(0).toUpperCase() + t.platform.slice(1),
              success: t.status === 'published',
              postId: t.platform_post_id,
              url: t.platform_url,
              error: t.error_message
            })),
            metrics: { reach: targets.filter(t => t.status === 'published').length * 20, likes: 0, clicks: 0 },
            error: targets.find(t => t.error_message)?.error_message || '',
            createdAt: r.created_at,
            updatedAt: r.updated_at
          };
        }
      }
    } catch (_) {}

    const lp = (localDb.posts || []).find(p => p.id === postId && (!userId || p.userId === userId || p.user_id === userId));
    return lp || null;
  },

  /**
   * Reschedules an existing scheduled post to a new date/time
   */
  async reschedulePost(postId, newScheduledAt, userId = null) {
    const safeDate = new Date(newScheduledAt).toISOString();
    const nowIso = new Date().toISOString();

    try {
      const filter = userId ? `posts?id=eq.${encodeURIComponent(postId)}&user_id=eq.${encodeURIComponent(userId)}` : `posts?id=eq.${encodeURIComponent(postId)}`;
      await supabaseFetch(filter, {
        method: 'PATCH',
        body: JSON.stringify({
          scheduled_at: safeDate,
          status: 'queued',
          updated_at: nowIso
        })
      });

      // Reset any pending targets
      await supabaseFetch(`post_targets?post_id=eq.${encodeURIComponent(postId)}&status=neq.published`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'queued',
          updated_at: nowIso
        })
      });
    } catch (e) {}

    const localDb = loadLocalDb();
    const p = (localDb.posts || []).find(x => x.id === postId && (!userId || x.userId === userId || x.user_id === userId));
    if (p) {
      p.status = 'Scheduled';
      p.date = safeDate;
      p.scheduledAt = safeDate;
      p.error = '';
      p.updatedAt = nowIso;
      saveLocalDb(localDb);
    }

    return { success: true, date: safeDate };
  },

  /**
   * Cancels a scheduled post
   */
  async cancelPost(postId, userId = null) {
    const nowIso = new Date().toISOString();

    try {
      const filter = userId ? `posts?id=eq.${encodeURIComponent(postId)}&user_id=eq.${encodeURIComponent(userId)}` : `posts?id=eq.${encodeURIComponent(postId)}`;
      await supabaseFetch(filter, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'draft',
          updated_at: nowIso
        })
      });
    } catch (e) {}

    const localDb = loadLocalDb();
    const p = (localDb.posts || []).find(x => x.id === postId && (!userId || x.userId === userId || x.user_id === userId));
    if (p) {
      p.status = 'Draft';
      p.updatedAt = nowIso;
      saveLocalDb(localDb);
    }

    return { success: true };
  },

  /**
   * Deletes a post and all associated targets (PS-15: Strict Authorization Verified)
   */
  async deletePost(postId, userId = null) {
    if (!postId) return { success: false, error: 'missing_id' };

    // PS-15: Verify post ownership BEFORE deleting targets or post records
    const adminIds = ['usr_admin_harizz', 'usr_default_postmint', 'usr_3ce0fa0bec4108552ac755ba', 'usr_7922d573f3242095', 'usr_851ad5fa3c3a4f89', 'usr_23da82fc2fa543dc', 'usr_7be7f11c817293b8', 'usr_bf9478a767d282f0', 'usr_admin_harizz_alt', 'admin'];
    let isAdmin = !userId || adminIds.includes(userId);

    if (!isAdmin && userId) {
      try {
        const user = await this.findUserById(userId);
        if (user && (user.role === 'admin' || user.email === 'explorewithharizz@gmail.com' || user.email === 'devpatternlabs@gmail.com')) {
          isAdmin = true;
        }
      } catch (_) {}
    }

    let isOwner = true;
    if (!isAdmin && userId) {
      try {
        const checkRes = await supabaseFetch('posts?id=eq.' + encodeURIComponent(postId) + '&select=id,user_id');
        if (checkRes.ok) {
          const rows = await checkRes.json();
          if (rows && rows.length > 0) {
            const rowUid = rows[0].user_id;
            if (rowUid && rowUid !== userId && !adminIds.includes(rowUid)) {
              // Also check if owner shares same email as caller
              const userObj = await this.findUserById(userId);
              const ownerObj = await this.findUserById(rowUid);
              if (!userObj || !ownerObj || userObj.email !== ownerObj.email) {
                isOwner = false;
              }
            }
          }
        }
      } catch (e) {}
    }

    if (!isOwner) {
      return { success: false, error: 'unauthorized', message: 'Post not found or unauthorized' };
    }

    try {
      await supabaseFetch('post_targets?post_id=eq.' + encodeURIComponent(postId), { method: 'DELETE' });
      await supabaseFetch('posts?id=eq.' + encodeURIComponent(postId), { method: 'DELETE' });
    } catch (e) {}

    const localDb = loadLocalDb();
    localDb.posts = (localDb.posts || []).filter(p => p.id !== postId);
    localDb.postTargets = (localDb.postTargets || []).filter(t => t.post_id !== postId);
    if (!localDb.deletedPostIds) localDb.deletedPostIds = [];
    if (!localDb.deletedPostIds.includes(postId)) {
      localDb.deletedPostIds.push(postId);
    }
    saveLocalDb(localDb);

    return { success: true, postId };
  },

  /**
   * Retries publishing for failed platforms only
   */
  async prepareRetryFailed(postId, userId = 'usr_default_postmint') {
    const nowIso = new Date().toISOString();
    try {
      await supabaseFetch(`post_targets?post_id=eq.${postId}&status=eq.failed`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'queued',
          attempt_count: 0,
          updated_at: nowIso
        })
      });

      await supabaseFetch(`posts?id=eq.${postId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'queued',
          updated_at: nowIso
        })
      });
    } catch (e) {}

    const localDb = loadLocalDb();
    const p = (localDb.posts || []).find(x => x.id === postId);
    if (p) {
      p.status = 'Scheduled';
      p.error = '';
      p.updatedAt = nowIso;
      saveLocalDb(localDb);
    }

    return { success: true };
  },

  // =========================================================================
  // Users & Authentication
  // =========================================================================

  async findUserByEmail(email) {
    if (!email) return null;
    const normalized = email.trim().toLowerCase();

    // 1. Check storage and local DB first for accurate mutable status & plan
    let storageUser = null;
    try {
      const storageUsers = await loadStorageJson('users', null);
      if (storageUsers && Array.isArray(storageUsers) && storageUsers.length > 0) {
        storageUser = storageUsers.find(u => (u.email || '').toLowerCase() === normalized);
      }
    } catch (e) {}

    const data = loadLocalDb();
    const localUser = (data.users || []).find(u => (u.email || '').toLowerCase() === normalized);
    const existing = storageUser ? { ...localUser, ...storageUser } : localUser;

    // 2. Try Supabase profiles table
    try {
      const res = await supabaseFetch(`profiles?email=eq.${encodeURIComponent(normalized)}&select=*`);
      if (res.ok) {
        const rows = await res.json();
        if (rows && rows.length > 0) {
          const p = rows[0];
          return {
            id: p.id,
            email: p.email,
            email_normalized: (p.email || '').toLowerCase(),
            name: p.display_name || existing?.name || (p.email || '').split('@')[0],
            avatar_url: p.avatar_url || existing?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(p.display_name || 'PM')}&backgroundColor=2563eb`,
            role: (p.email || '').toLowerCase() === 'explorewithharizz@gmail.com' ? 'admin' : (existing?.role || p.role || 'user'),
            status: existing?.status || existing?.account_status || 'active',
            account_status: existing?.account_status || existing?.status || 'active',
            plan: existing?.plan || 'free',
            signup_logged: existing?.signup_logged ?? false,
            onboarding_completed: existing?.onboarding_completed ?? true
          };
        }
      }
    } catch (e) {}

    if (existing) return existing;
    return null;
  },

  async findUserById(id) {
    if (!id) return null;

    // 1. Check storage and local DB first for accurate mutable status & plan
    let storageUser = null;
    try {
      const storageUsers = await loadStorageJson('users', null);
      if (storageUsers && Array.isArray(storageUsers) && storageUsers.length > 0) {
        storageUser = storageUsers.find(u => u.id === id);
      }
    } catch (e) {}

    const data = loadLocalDb();
    const localUser = (data.users || []).find(u => u.id === id);
    const existing = storageUser ? { ...localUser, ...storageUser } : localUser;

    if (existing && existing.email) {
      const isEmailAdmin = (existing.email || '').trim().toLowerCase() === 'explorewithharizz@gmail.com';
      existing.role = isEmailAdmin ? 'admin' : 'user';
      return existing;
    }

    // 2. Try Supabase profiles table fallback
    try {
      const res = await supabaseFetch(`profiles?id=eq.${encodeURIComponent(id)}&select=*`);
      if (res.ok) {
        const rows = await res.json();
        if (rows && rows.length > 0) {
          const p = rows[0];
          const isEmailAdmin = (p.email || '').trim().toLowerCase() === 'explorewithharizz@gmail.com';
          return {
            id: p.id,
            email: p.email,
            email_normalized: (p.email || '').toLowerCase(),
            name: p.display_name || (p.email || '').split('@')[0],
            avatar_url: p.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(p.display_name || 'PM')}&backgroundColor=2563eb`,
            role: isEmailAdmin ? 'admin' : 'user',
            status: 'active',
            account_status: 'active',
            plan: 'free',
            signup_logged: true,
            onboarding_completed: true
          };
        }
      }
    } catch (e) {}

    return null;
  },

  async createOrUpdateGoogleUser({ googleId, email, name, avatarUrl }) {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const nowIso = new Date().toISOString();

    let existingUser = await this.findUserByEmail(normalizedEmail);
    let isNewUser = false;

    if (!existingUser) {
      isNewUser = true;
      const newUserId = `usr_${crypto.randomBytes(8).toString('hex')}`;
      const role = normalizedEmail === 'explorewithharizz@gmail.com' ? 'admin' : 'user';
      const newUser = {
        id: newUserId,
        google_id: googleId || '',
        name: name || normalizedEmail.split('@')[0],
        email: normalizedEmail,
        email_normalized: normalizedEmail,
        avatar_url: avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || 'PM')}&backgroundColor=10b981`,
        auth_provider: 'google',
        role,
        created_at: nowIso,
        updated_at: nowIso,
        last_login: nowIso,
        onboarding_completed: false,
        account_status: 'active',
        status: 'active',
        signup_logged: false
      };

      try {
        await supabaseFetch('users', {
          method: 'POST',
          body: JSON.stringify(newUser)
        });
      } catch (e) {}

      const localData = loadLocalDb();
      if (!localData.users) localData.users = [];
      localData.users.push(newUser);
      saveLocalDb(localData);

      // Persist to Supabase Storage users.json for cross-instance visibility
      try {
        const storageUsers = await loadStorageJson('users', []);
        if (!storageUsers.some(u => u.id === newUser.id || (u.email || '').toLowerCase() === normalizedEmail)) {
          storageUsers.push(newUser);
          await saveStorageJson('users', storageUsers);
        }
      } catch (e) {}

      // Create welcome notification for new user
      await this.createNotification(newUser.id, {
        title: 'Welcome to PostMint!',
        message: 'Welcome to PostMint! Connect your Instagram, Facebook, or YouTube to start scheduling content.',
        type: 'welcome',
        cta_label: 'Connect Accounts',
        cta_url: '#accounts'
      });

      // Strictly idempotent Google Form registration: only on first account creation
      const alreadyLogged = await this.isEmailLogged(normalizedEmail);
      if (!alreadyLogged) {
        try {
          const { logUserRegistrationToGoogleForm } = require('./googleFormRegistration');
          await logUserRegistrationToGoogleForm({
            email: normalizedEmail,
            name: newUser.name,
            userId: newUser.id,
            authMethod: 'google_user'
          });
          await this.markEmailLogged(normalizedEmail);
          newUser.signup_logged = true;
        } catch (e) {
          console.warn('[DB Google Form Warning]:', e.message);
        }
      } else {
        newUser.signup_logged = true;
      }

      return { user: newUser, isNewUser: true };
    } else {
      // Returning user: NEVER call Google Form
      const updates = {
        last_login: nowIso,
        updated_at: nowIso
      };
      if (googleId && !existingUser.google_id) updates.google_id = googleId;
      if (avatarUrl) updates.avatar_url = avatarUrl;
      if (name && !existingUser.name) updates.name = name;

      try {
        await supabaseFetch(`users?id=eq.${existingUser.id}`, {
          method: 'PATCH',
          body: JSON.stringify(updates)
        });
      } catch (e) {}

      const localData = loadLocalDb();
      const idx = (localData.users || []).findIndex(u => u.id === existingUser.id || (u.email && u.email.toLowerCase() === normalizedEmail));
      if (idx !== -1) {
        localData.users[idx] = { ...localData.users[idx], ...updates };
        existingUser = localData.users[idx];
      } else {
        existingUser = { ...existingUser, ...updates };
        localData.users.push(existingUser);
      }
      saveLocalDb(localData);

      try {
        const storageUsers = await loadStorageJson('users', []);
        const sIdx = storageUsers.findIndex(u => u.id === existingUser.id || (u.email && u.email.toLowerCase() === normalizedEmail));
        if (sIdx !== -1) {
          storageUsers[sIdx] = { ...storageUsers[sIdx], ...updates };
          await saveStorageJson('users', storageUsers);
        }
      } catch (e) {}

      const isEmailAdmin = (normalizedEmail === 'explorewithharizz@gmail.com');
      existingUser.role = isEmailAdmin ? 'admin' : 'user';
      return { user: existingUser, isNewUser: false };
    }
  },

  async updateUserOnboarding(userId, completed = true) {
    const nowIso = new Date().toISOString();
    try {
      await supabaseFetch(`users?id=eq.${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ onboarding_completed: completed, updated_at: nowIso })
      });
    } catch (e) {}

    const localData = loadLocalDb();
    const u = (localData.users || []).find(x => x.id === userId);
    if (u) {
      u.onboarding_completed = completed;
      u.updated_at = nowIso;
      saveLocalDb(localData);
    }
    return { success: true };
  },

  // =========================================================================
  // Sessions Management
  // =========================================================================

  async createSession(userId, durationHours = 24 * 7) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationHours * 3600 * 1000).toISOString();
    let token;
    try {
      token = encryptToken(JSON.stringify({ userId, expiresAt, createdAt: now.toISOString() }));
    } catch (e) {
      token = crypto.randomBytes(32).toString('hex');
    }

    const sessionObj = {
      token,
      userId,
      createdAt: now.toISOString(),
      expiresAt
    };

    try {
      await supabaseFetch('sessions', {
        method: 'POST',
        body: JSON.stringify({
          token,
          user_id: userId,
          created_at: now.toISOString(),
          expires_at: expiresAt
        })
      });
    } catch (e) {}

    const localData = loadLocalDb();
    if (!localData.sessions) localData.sessions = [];
    localData.sessions.push(sessionObj);
    saveLocalDb(localData);

    return sessionObj;
  },

  async getSessionUser(token) {
    if (!token) return null;
    const now = new Date().toISOString();

    // 1. Decrypt stateless session token (works across all serverless lambda instances)
    try {
      const decrypted = decryptToken(token);
      const payload = JSON.parse(decrypted);
      if (payload && payload.userId && (!payload.expiresAt || payload.expiresAt > now)) {
        const user = await this.findUserById(payload.userId);
        if (user) return user;
      }
    } catch (e) {}

    // 2. Fallback to local session storage
    const localData = loadLocalDb();
    const localSession = (localData.sessions || []).find(s => s.token === token && s.expiresAt > now);
    if (localSession) {
      const user = await this.findUserById(localSession.userId);
      if (user) return user;
    }

    // 3. Fallback to Supabase sessions table
    try {
      const res = await supabaseFetch(`sessions?token=eq.${token}&expires_at=gt.${now}&select=*`);
      if (res.ok) {
        const rows = await res.json();
        if (rows && rows.length > 0) {
          const user = await this.findUserById(rows[0].user_id);
          if (user) return user;
        }
      }
    } catch (e) {}

    return null;
  },

  async deleteSession(token) {
    if (!token) return;
    try {
      await supabaseFetch(`sessions?token=eq.${token}`, { method: 'DELETE' });
    } catch (e) {}

    const localData = loadLocalDb();
    if (localData.sessions) {
      localData.sessions = localData.sessions.filter(s => s.token !== token);
      saveLocalDb(localData);
    }
  },

  // =========================================================================
  // Notifications
  // =========================================================================

  async createNotification(userId, { title, message, type = 'info', cta_label = null, cta_url = null }) {
    const notif = {
      id: `notif_${crypto.randomBytes(6).toString('hex')}`,
      userId,
      title,
      message,
      type,
      cta_label,
      cta_url,
      read: false,
      read_by: [],
      createdAt: new Date().toISOString()
    };

    try {
      await supabaseFetch('notifications', {
        method: 'POST',
        body: JSON.stringify({
          id: notif.id,
          user_id: userId,
          title,
          message,
          type,
          cta_label,
          cta_url,
          read: false,
          created_at: notif.createdAt
        })
      });
    } catch (e) {}

    const localData = loadLocalDb();
    if (!localData.notifications) localData.notifications = [];
    localData.notifications.unshift(notif);
    saveLocalDb(localData);

    try {
      const storageNotifs = await loadStorageJson('notifications', []);
      const updated = Array.isArray(storageNotifs) ? storageNotifs.slice() : [];
      updated.unshift(notif);
      await saveStorageJson('notifications', updated);
    } catch (e) {
      console.warn('[DB] createNotification storage save error:', e.message);
    }

    return notif;
  },

  async getNotifications(userId) {
    let allNotifs = [];
    try {
      const storageNotifs = await loadStorageJson('notifications', null);
      if (storageNotifs && Array.isArray(storageNotifs)) {
        allNotifs = storageNotifs.slice();
      }
    } catch (e) {
      console.warn('[DB] getNotifications storage error:', e.message);
    }

    if (allNotifs.length === 0) {
      const localData = loadLocalDb();
      allNotifs = (localData.notifications || []).slice();
    }

    // Synthesize broadcast notifications for any active announcements
    try {
      const announcements = await this.getAnnouncements();
      for (const ann of announcements) {
        if (!allNotifs.some(n => n.announcement_id === ann.id)) {
          const notifTitle = ann.title.startsWith('Postsprint') ? ann.title : `Postsprint: ${ann.title}`;
          allNotifs.unshift({
            id: `notif_${ann.id}`,
            announcement_id: ann.id,
            userId: 'all',
            title: notifTitle,
            message: ann.message,
            type: 'announcement',
            cta_label: ann.cta_label,
            cta_url: ann.cta_url,
            read: false,
            read_by: [],
            createdAt: ann.created_at
          });
        }
      }
    } catch (e) {}

    // Filter for this userId or broadcast ('all')
    const userFiltered = allNotifs.filter(n => !userId ? n.userId === 'all' : (n.userId === userId || n.userId === 'all'));

    return userFiltered.map(n => {
      let isRead = Boolean(n.read);
      if (n.userId === 'all') {
        const readBy = Array.isArray(n.read_by) ? n.read_by : [];
        if (userId && readBy.includes(userId)) {
          isRead = true;
        }
      }
      return { ...n, read: isRead };
    });
  },

  async markNotificationRead(notifId, userId) {
    let updatedStorage = false;
    try {
      const storageNotifs = await loadStorageJson('notifications', []);
      if (Array.isArray(storageNotifs)) {
        const item = storageNotifs.find(n => n.id === notifId && (!userId || n.userId === userId || n.userId === 'all'));
        if (item) {
          if (item.userId === 'all' && userId) {
            if (!Array.isArray(item.read_by)) item.read_by = [];
            if (!item.read_by.includes(userId)) item.read_by.push(userId);
          } else {
            item.read = true;
          }
          await saveStorageJson('notifications', storageNotifs);
          updatedStorage = true;
        }
      }
    } catch (e) {
      console.warn('[DB] markNotificationRead storage error:', e.message);
    }

    const localData = loadLocalDb();
    if (localData.notifications) {
      const item = localData.notifications.find(n => n.id === notifId && (!userId || n.userId === userId || n.userId === 'all'));
      if (item) {
        if (item.userId === 'all' && userId) {
          if (!Array.isArray(item.read_by)) item.read_by = [];
          if (!item.read_by.includes(userId)) item.read_by.push(userId);
        } else {
          item.read = true;
        }
        saveLocalDb(localData);
      }
    }
    return { success: true };
  },

  async getAnnouncements() {
    try {
      const storageAnnouncements = await loadStorageJson('announcements', null);
      if (storageAnnouncements && Array.isArray(storageAnnouncements)) {
        return storageAnnouncements;
      }
    } catch (e) {
      console.warn('[DB] getAnnouncements storage fetch error:', e.message);
    }
    const localData = loadLocalDb();
    return localData.announcements || [];
  },

  async createAnnouncement({ title, message, cta_label = null, cta_url = null, created_by = 'admin' }) {
    const localData = loadLocalDb();
    if (!localData.announcements) localData.announcements = [];
    const annId = `ann_${crypto.randomBytes(6).toString('hex')}`;
    const ann = {
      id: annId,
      title: title || 'Postsprint Update',
      message: message || '',
      cta_label: cta_label || null,
      cta_url: cta_url || null,
      created_by: created_by || 'admin',
      created_at: new Date().toISOString()
    };
    localData.announcements.unshift(ann);

    // Broadcast as notification to all users
    const notifTitle = ann.title.startsWith('Postsprint') ? ann.title : `Postsprint: ${ann.title}`;
    const notif = {
      id: `notif_${crypto.randomBytes(6).toString('hex')}`,
      announcement_id: annId,
      userId: 'all',
      title: notifTitle,
      message: ann.message,
      type: 'announcement',
      cta_label: ann.cta_label,
      cta_url: ann.cta_url,
      read: false,
      read_by: [],
      createdAt: ann.created_at
    };
    if (!localData.notifications) localData.notifications = [];
    localData.notifications.unshift(notif);
    saveLocalDb(localData);

    // Persist announcements to Supabase Storage
    try {
      const storageAnnouncements = await loadStorageJson('announcements', []);
      const updatedAnnouncements = Array.isArray(storageAnnouncements) ? storageAnnouncements.slice() : [];
      const filtered = updatedAnnouncements.filter(a => a.id !== annId);
      filtered.unshift(ann);
      await saveStorageJson('announcements', filtered);
    } catch (e) {
      console.warn('[DB] createAnnouncement save to storage error:', e.message);
    }

    // Persist notifications to Supabase Storage
    try {
      const storageNotifs = await loadStorageJson('notifications', []);
      const updatedNotifs = Array.isArray(storageNotifs) ? storageNotifs.slice() : [];
      const filteredNotifs = updatedNotifs.filter(n => n.announcement_id !== annId);
      filteredNotifs.unshift(notif);
      await saveStorageJson('notifications', filteredNotifs);
    } catch (e) {
      console.warn('[DB] createAnnouncement notifs save to storage error:', e.message);
    }

    return ann;
  },

  async deleteAnnouncement(annId) {
    const localData = loadLocalDb();
    if (localData.announcements) {
      localData.announcements = localData.announcements.filter(a => a.id !== annId);
    }
    if (localData.notifications) {
      localData.notifications = localData.notifications.filter(n => n.announcement_id !== annId);
    }
    saveLocalDb(localData);

    try {
      const storageAnnouncements = await loadStorageJson('announcements', []);
      if (Array.isArray(storageAnnouncements)) {
        const filtered = storageAnnouncements.filter(a => a.id !== annId);
        await saveStorageJson('announcements', filtered);
      }
    } catch (e) {
      console.warn('[DB] deleteAnnouncement from storage error:', e.message);
    }

    try {
      const storageNotifs = await loadStorageJson('notifications', []);
      if (Array.isArray(storageNotifs)) {
        const filtered = storageNotifs.filter(n => n.announcement_id !== annId);
        await saveStorageJson('notifications', filtered);
      }
    } catch (e) {
      console.warn('[DB] deleteAnnouncement notifs from storage error:', e.message);
    }

    return { success: true };
  },

  // =========================================================================
  // Music Library Catalog (Admin & User Uploads / Google Drive Musics)
  // =========================================================================
  GOOGLE_DRIVE_FOLDER_ID: '14t8aFCE4Df3zTC3v7MEW8NDgcV2kD0Cc',
  GOOGLE_DRIVE_FOLDER_URL: 'https://drive.google.com/drive/folders/14t8aFCE4Df3zTC3v7MEW8NDgcV2kD0Cc?usp=sharing',

  async fetchDriveFolderTracks(folderId = '14t8aFCE4Df3zTC3v7MEW8NDgcV2kD0Cc') {
    if (global._driveFolderCache && (Date.now() - global._driveFolderCacheTime < 25000)) {
      return global._driveFolderCache;
    }

    const url = `https://drive.google.com/drive/folders/${folderId}?usp=sharing`;
    const https = require('https');

    const tracks = await new Promise((resolve) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          const found = [];
          const regex = /aria-label="([^"]+?)\.(mp3|wav|m4a|aac|ogg)\s+Audio[^"]*"[^>]*?ssk='5:auSv138:([a-zA-Z0-9_-]+)'/gi;
          let m;
          while ((m = regex.exec(data)) !== null) {
            const rawName = m[1].trim();
            const rawFileId = m[3];
            const fileId = rawFileId.replace(/-[0-9]+-[0-9]+$/, '').replace(/-[0-9]+$/, '');

            let title = rawName.replace(/_+/g, ' ').replace(/\(MP3.*?\)/gi, '').replace(/-\s*Think Music.*$/i, '').trim();
            let artist = 'Featured Creator';
            let genre = 'Trending';

            if (/amaran/i.test(title)) {
              title = 'Hey Minnale';
              artist = 'G.V. Prakash Kumar · Amaran';
              genre = 'Cinematic';
            } else if (/kannukulla/i.test(title)) {
              title = 'Kannukulla Song';
              artist = 'Sai Abhyankkar · Jonita Gandhi (Dude)';
              genre = 'Trending';
            }

            found.push({
              id: 'gdrive_' + fileId,
              driveFileId: fileId,
              title,
              artist,
              genre,
              mood: '🔥 Trending Reels',
              duration: '0:30',
              bpm: 120,
              audioUrl: `/api/social?subpath=music-stream&id=${fileId}`,
              driveUrl: `https://drive.google.com/file/d/${fileId}/view?usp=sharing`,
              driveFolderUrl: `https://drive.google.com/drive/folders/${folderId}?usp=sharing`,
              sourceType: 'google_drive',
              color: '#2563eb',
              createdAt: '2026-10-30T12:00:00.000Z',
              createdBy: 'drive_folder_sync'
            });
          }
          resolve(found);
        });
      }).on('error', (err) => {
        console.warn('[DB] fetchDriveFolderTracks error:', err.message);
        resolve([]);
      });
    });

    if (tracks && tracks.length > 0) {
      global._driveFolderCache = tracks;
      global._driveFolderCacheTime = Date.now();
    }
    return tracks || [];
  },

  async getMusicTracks() {
    const DEMO_MUSIC_IDS = new Set([
      'tr_3_movie_moon_bgm',
      'tr_midnight_vibe',
      'tr_viral_phonk',
      'tr_golden_glow',
      'tr_bassline_drop',
      'lo_rainy_cafe',
      'lo_late_study',
      'lo_sunset_rooftop',
      'en_hyperpop',
      'en_festival_lights',
      'ci_rise_champions',
      'ci_limitless_horizon',
      'ci_future_tech',
      'ae_morning_coffee',
      'ae_matcha_latte',
      'ae_parisian_stroll',
      'su_ibiza_sunset',
      'su_copacabana'
    ]);

    const DEMO_MUSIC_TITLES = new Set([
      '3 movie moon bgm',
      'midnight vibe',
      'tokyo night phonk',
      'golden hour glow',
      'bassline drop',
      'rainy café window',
      'rainy cafe window',
      'late night coding',
      'sunset rooftop',
      'hyperpop energy',
      'festival lights',
      'rise of champions',
      'limitless horizon',
      'silicon frontier',
      'morning sunshine vlog',
      'matcha latte chill',
      'parisian stroll',
      'ibiza sunset chill',
      'copacabana rhythm'
    ]);

    let hadDemoTracks = false;
    let localTracks = [];

    try {
      const storageTracks = await loadStorageJson('music_tracks', null);
      if (storageTracks && Array.isArray(storageTracks)) {
        localTracks = storageTracks.filter(t => {
          if (!t) return false;
          const idMatch = DEMO_MUSIC_IDS.has(t.id);
          const titleMatch = DEMO_MUSIC_TITLES.has((t.title || '').toLowerCase().trim());
          if (idMatch || titleMatch) {
            hadDemoTracks = true;
            return false;
          }
          return true;
        });

        if (hadDemoTracks) {
          await saveStorageJson('music_tracks', localTracks).catch(e => console.warn('[DB] saveStorageJson purge error:', e.message));
        }
      }
    } catch (e) {
      console.warn('[DB] getMusicTracks storage fetch error:', e.message);
    }

    if (!localTracks || localTracks.length === 0) {
      const localData = loadLocalDb();
      if (localData.music_tracks && Array.isArray(localData.music_tracks)) {
        localTracks = localData.music_tracks.filter(t => {
          if (!t) return false;
          return !DEMO_MUSIC_IDS.has(t.id) && !DEMO_MUSIC_TITLES.has((t.title || '').toLowerCase().trim());
        });
        localData.music_tracks = localTracks;
        saveLocalDb(localData);
      }
    }

    // Automatically sync tracks from the shared Google Drive Database Folder
    const driveFolderTracks = await this.fetchDriveFolderTracks(this.GOOGLE_DRIVE_FOLDER_ID).catch(() => []);

    const existingFileIds = new Set();
    const existingTitles = new Set();
    (localTracks || []).forEach(t => {
      if (t.driveFileId) existingFileIds.add(t.driveFileId);
      if (t.title) existingTitles.add(t.title.toLowerCase().trim());
    });

    const combined = [...(localTracks || [])];
    driveFolderTracks.forEach(dt => {
      if (!existingFileIds.has(dt.driveFileId) && !existingTitles.has(dt.title.toLowerCase().trim())) {
        combined.push(dt);
      }
    });

    return combined;
  },

  async createMusicTrack(trackData) {
    const localData = loadLocalDb();
    if (!localData.music_tracks) {
      localData.music_tracks = [];
    }

    let audioUrl = (trackData.audioUrl || '').trim();
    let driveUrl = (trackData.driveUrl || '').trim();
    let sourceType = trackData.sourceType || 'upload';

    let driveFileId = null;
    // Auto-detect and parse Google Drive links
    const driveMatch = (driveUrl || audioUrl).match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || 
                       (driveUrl || audioUrl).match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
      const fileId = driveMatch[1];
      driveFileId = fileId;
      audioUrl = "/api/social?subpath=music-stream&id=" + fileId;
      driveUrl = driveUrl || ("https://drive.google.com/file/d/" + fileId + "/view?usp=sharing");
      sourceType = 'google_drive';
    }

    const trackId = trackData.id || ("tr_" + crypto.randomBytes(6).toString('hex'));
    const newTrack = {
      id: trackId,
      driveFileId,
      title: trackData.title || 'Custom Track',
      artist: trackData.artist || 'Original Audio',
      genre: trackData.genre || 'Trending',
      mood: trackData.mood || '🔥 Trending Reels',
      duration: trackData.duration || '0:30',
      bpm: Number(trackData.bpm) || 120,
      audioUrl,
      driveUrl: driveUrl || null,
      driveFolderUrl: this.GOOGLE_DRIVE_FOLDER_URL,
      sourceType,
      color: trackData.color || '#2563eb',
      coverUrl: trackData.coverUrl || null,
      previewType: trackData.previewType || 'synth_trending',
      createdAt: new Date().toISOString(),
      createdBy: trackData.createdBy || 'user'
    };

    localData.music_tracks = (localData.music_tracks || []).filter(t => t.id !== trackId);
    localData.music_tracks.unshift(newTrack);
    saveLocalDb(localData);

    try {
      const currentList = await this.getMusicTracks();
      const updated = currentList.filter(t => t.id !== trackId);
      updated.unshift(newTrack);
      await saveStorageJson('music_tracks', updated);
    } catch (e) {
      console.warn('[DB] saveStorageJson music_tracks error:', e.message);
    }

    return newTrack;
  },

  async deleteMusicTrack(trackId) {
    if (!trackId) return { success: false, error: 'Track ID required' };
    const localData = loadLocalDb();
    if (localData.music_tracks) {
      localData.music_tracks = localData.music_tracks.filter(t => t.id !== trackId);
      saveLocalDb(localData);
    }

    try {
      const storageTracks = await loadStorageJson('music_tracks', []);
      if (Array.isArray(storageTracks)) {
        const filtered = storageTracks.filter(t => t.id !== trackId);
        await saveStorageJson('music_tracks', filtered);
      }
    } catch (e) {
      console.warn('[DB] deleteMusicTrack storage error:', e.message);
    }

    return { success: true };
  },

  // =========================================================================
  // Social Comments (YouTube, Facebook, Instagram)
  // =========================================================================

  async getComments(userId) {
    const localData = loadLocalDb();
    const list = localData.comments || [];
    const sanitized = list.filter(c => c && c.id && !c.id.startsWith('cmt_yt_') && !c.id.startsWith('cmt_ig_') && !c.id.startsWith('cmt_fb_') && !c.id.startsWith('demo_'));
    if (sanitized.length !== list.length) {
      localData.comments = sanitized;
      saveLocalDb(localData);
    }
    return sanitized;
  },

  async saveComment(userId, comment) {
    const localData = loadLocalDb();
    if (!localData.comments) localData.comments = [];
    const existingIdx = localData.comments.findIndex(c => c.id === comment.id);
    if (existingIdx >= 0) {
      localData.comments[existingIdx] = { ...localData.comments[existingIdx], ...comment };
    } else {
      localData.comments.unshift(comment);
    }
    saveLocalDb(localData);
    return comment;
  },

  async replyToComment(userId, { commentId, text, author = 'Postmint Studio', platform }) {
    const localData = loadLocalDb();
    if (!localData.comments) localData.comments = [];
    const comment = localData.comments.find(c => c.id === commentId);
    const replyObj = {
      id: `rep_${crypto.randomBytes(6).toString('hex')}`,
      author,
      text,
      createdAt: new Date().toISOString(),
      platform: platform || comment?.platform || 'YouTube'
    };

    if (comment) {
      if (!comment.replies) comment.replies = [];
      comment.replies.push(replyObj);
      saveLocalDb(localData);
    }

    return replyObj;
  },

  // =========================================================================
  // Social Direct Messages (Instagram Direct & Facebook Messenger)
  // =========================================================================

  async getConversations(userId) {
    const localData = loadLocalDb();
    const list = localData.conversations || [];
    const sanitized = list.filter(c => c && c.id && !c.id.startsWith('conv_ig_') && !c.id.startsWith('conv_fb_') && !c.id.startsWith('demo_'));
    if (sanitized.length !== list.length) {
      localData.conversations = sanitized;
      saveLocalDb(localData);
    }
    return sanitized;
  },

  async saveConversation(userId, conversation) {
    const localData = loadLocalDb();
    if (!localData.conversations) localData.conversations = [];
    const idx = localData.conversations.findIndex(c => c.id === conversation.id);
    if (idx >= 0) {
      localData.conversations[idx] = { ...localData.conversations[idx], ...conversation };
    } else {
      localData.conversations.unshift(conversation);
    }
    saveLocalDb(localData);
    return conversation;
  },

  async addConversationMessage(userId, { conversationId, text, sender = 'you', senderName = 'Postmint Studio', platform }) {
    const localData = loadLocalDb();
    if (!localData.conversations) localData.conversations = [];
    let conv = localData.conversations.find(c => c.id === conversationId);

    const msgObj = {
      id: `msg_${crypto.randomBytes(6).toString('hex')}`,
      sender,
      senderName,
      text,
      createdAt: new Date().toISOString(),
      platform: platform || conv?.platform || 'Instagram'
    };

    if (conv) {
      if (!conv.messages) conv.messages = [];
      conv.messages.push(msgObj);
      conv.updatedAt = msgObj.createdAt;
      conv.lastMessage = text;
      if (sender === 'them') conv.unread = true;
      saveLocalDb(localData);
    }

    return msgObj;
  },

  normalizeEmail(email) {
    if (!email) return '';
    return String(email).trim().toLowerCase();
  },

  async isEmailLogged(email) {
    if (!email) return true;
    const normalized = this.normalizeEmail(email);
    if (!normalized || normalized === 'explorewithharizz@gmail.com') return true;

    if (loggedEmailsMemoryCache.has(normalized)) return true;

    const localData = loadLocalDb();
    if (Array.isArray(localData.logged_emails) && localData.logged_emails.includes(normalized)) {
      loggedEmailsMemoryCache.add(normalized);
      return true;
    }

    const user = (localData.users || []).find(u => (u.email || '').toLowerCase() === normalized);
    if (user && user.signup_logged) {
      loggedEmailsMemoryCache.add(normalized);
      return true;
    }

    try {
      const remoteLogged = await loadStorageJson('logged_emails', null);
      if (Array.isArray(remoteLogged) && remoteLogged.includes(normalized)) {
        loggedEmailsMemoryCache.add(normalized);
        return true;
      }
    } catch (e) {}

    return false;
  },

  async markEmailLogged(email) {
    if (!email) return;
    const normalized = this.normalizeEmail(email);
    if (!normalized) return;

    loggedEmailsMemoryCache.add(normalized);

    const localData = loadLocalDb();
    if (!Array.isArray(localData.logged_emails)) localData.logged_emails = [];
    if (!localData.logged_emails.includes(normalized)) {
      localData.logged_emails.push(normalized);
    }
    const uIdx = (localData.users || []).findIndex(u => (u.email || '').toLowerCase() === normalized);
    if (uIdx !== -1) {
      localData.users[uIdx].signup_logged = true;
    }
    saveLocalDb(localData);

    try {
      const remoteLogged = await loadStorageJson('logged_emails', []);
      const currentList = Array.isArray(remoteLogged) ? remoteLogged : [];
      if (!currentList.includes(normalized)) {
        currentList.push(normalized);
        await saveStorageJson('logged_emails', currentList);
      }
    } catch (e) {}
  },

  async createUser({ email, name, avatarUrl, authProvider = 'email_otp', role = null }) {
    const normalizedEmail = this.normalizeEmail(email);
    const nowIso = new Date().toISOString();
    const existing = await this.findUserByEmail(normalizedEmail);
    if (existing) {
      return { user: existing, isNewUser: false };
    }

    const assignedRole = role || (normalizedEmail === 'explorewithharizz@gmail.com' ? 'admin' : 'user');
    const newUserId = `usr_${crypto.randomBytes(8).toString('hex')}`;
    const newUser = {
      id: newUserId,
      name: name || normalizedEmail.split('@')[0],
      email: normalizedEmail,
      email_normalized: normalizedEmail,
      avatar_url: avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || 'PM')}&backgroundColor=2563eb`,
      auth_provider: authProvider,
      role: assignedRole,
      created_at: nowIso,
      updated_at: nowIso,
      last_login: nowIso,
      onboarding_completed: false,
      account_status: 'active',
      status: 'active',
      signup_logged: false
    };

    const localData = loadLocalDb();
    if (!localData.users) localData.users = [];
    localData.users.push(newUser);
    saveLocalDb(localData);

    try {
      const storageUsers = await loadStorageJson('users', []);
      if (!storageUsers.some(u => u.id === newUser.id || (u.email || '').toLowerCase() === normalizedEmail)) {
        storageUsers.push(newUser);
        await saveStorageJson('users', storageUsers);
      }
    } catch (e) {}

    try {
      await supabaseFetch('profiles', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          id: newUser.id,
          email: normalizedEmail,
          display_name: newUser.name,
          timezone: 'UTC',
          created_at: nowIso,
          updated_at: nowIso
        })
      });
    } catch (e) {}

    // Welcome notification
    await this.createNotification(newUser.id, {
      title: 'Welcome to PostMint!',
      message: 'Welcome to PostMint! Connect your Instagram, Facebook, or YouTube to start scheduling content.',
      type: 'welcome',
      cta_label: 'Connect Accounts',
      cta_url: '#accounts'
    });

    // Strictly idempotent Google Form registration check
    const alreadyLogged = await this.isEmailLogged(normalizedEmail);
    if (!alreadyLogged) {
      try {
        const { logUserRegistrationToGoogleForm } = require('./googleFormRegistration');
        await logUserRegistrationToGoogleForm({
          email: normalizedEmail,
          name: newUser.name,
          userId: newUser.id,
          authMethod: authProvider
        });
        await this.markEmailLogged(normalizedEmail);
        newUser.signup_logged = true;
      } catch (e) {
        console.warn('[DB Google Form Warning]:', e.message);
      }
    } else {
      newUser.signup_logged = true;
    }

    return { user: newUser, isNewUser: true };
  },

  async updateUser(id, updates) {
    const nowIso = new Date().toISOString();
    // Normalize status and account_status if either is passed
    if (updates.status && !updates.account_status) updates.account_status = updates.status;
    if (updates.account_status && !updates.status) updates.status = updates.account_status;

    try {
      const storageUsers = await loadStorageJson('users', []);
      let sIdx = storageUsers.findIndex(u => u.id === id || (u.email && u.email.toLowerCase() === (updates.email || '').toLowerCase()));
      if (sIdx !== -1) {
        storageUsers[sIdx] = { ...storageUsers[sIdx], ...updates, updated_at: nowIso };
      } else {
        const localData = loadLocalDb();
        const u = (localData.users || []).find(x => x.id === id) || { id, ...updates };
        storageUsers.push({ ...u, ...updates, updated_at: nowIso });
      }
      await saveStorageJson('users', storageUsers);
    } catch (e) {}

    const localData = loadLocalDb();
    const idx = (localData.users || []).findIndex(u => u.id === id || (u.email && updates.email && u.email.toLowerCase() === updates.email.toLowerCase()));
    if (idx !== -1) {
      localData.users[idx] = { ...localData.users[idx], ...updates, updated_at: nowIso };
      saveLocalDb(localData);
      return localData.users[idx];
    }
    return null;
  },

  async deleteUser(id) {
    if (!id) return false;
    const adminEmail = 'explorewithharizz@gmail.com';
    try {
      const storageUsers = await loadStorageJson('users', []);
      const filtered = storageUsers.filter(u => u.id !== id && (u.email || '').toLowerCase() !== adminEmail);
      await saveStorageJson('users', filtered);
    } catch (e) {}

    const localData = loadLocalDb();
    if (localData.users) {
      localData.users = localData.users.filter(u => u.id !== id && (u.email || '').toLowerCase() !== adminEmail);
      saveLocalDb(localData);
    }
    return true;
  },

  async getAllUsers(filters = {}) {
    const localData = loadLocalDb();
    const usersMap = new Map();

    // 1. Storage users
    try {
      const storageUsers = await loadStorageJson('users', []);
      if (Array.isArray(storageUsers)) {
        for (const u of storageUsers) {
          if (u && u.id && u.email) {
            const emailNorm = (u.email || '').toLowerCase();
            // Filter out any mock/test emails or bots
            if (emailNorm.includes('example.com') || emailNorm.includes('test_') || emailNorm.includes('creator_') || emailNorm.includes('mock_')) continue;
            usersMap.set(u.id, u);
          }
        }
      }
    } catch (e) {}

    // 2. Local users
    for (const u of (localData.users || [])) {
      if (u && u.id && u.email) {
        const emailNorm = (u.email || '').toLowerCase();
        if (emailNorm.includes('example.com') || emailNorm.includes('test_') || emailNorm.includes('creator_') || emailNorm.includes('mock_')) continue;
        if (!usersMap.has(u.id)) {
          usersMap.set(u.id, u);
        } else {
          usersMap.set(u.id, { ...usersMap.get(u.id), ...u });
        }
      }
    }

    // Always ensure admin
    const adminEmail = 'explorewithharizz@gmail.com';
    let admin = usersMap.get('usr_admin_harizz');
    if (!admin) {
      admin = (localData.users || []).find(u => (u.email || '').toLowerCase() === adminEmail) || {
        id: 'usr_admin_harizz',
        email: adminEmail,
        email_normalized: adminEmail,
        name: 'Harizz (Admin)',
        avatar_url: 'https://api.dicebear.com/7.x/initials/svg?seed=Harizz&backgroundColor=2563eb',
        auth_provider: 'google',
        role: 'admin',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
        onboarding_completed: true,
        account_status: 'active',
        status: 'active',
        signup_logged: true
      };
      usersMap.set('usr_admin_harizz', admin);
    }

    let users = Array.from(usersMap.values());

    if (filters.q) {
      const q = String(filters.q).toLowerCase().trim();
      users = users.filter(u =>
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.id && u.id.toLowerCase().includes(q))
      );
    }
    if (filters.status && filters.status !== 'all') {
      users = users.filter(u => (u.status || 'active') === filters.status);
    }
    return users;
  },

  // =========================================================================
  // OTP Management
  // =========================================================================

  async saveOtpCode({ email_normalized, hashed_code, raw_code, purpose, expires_at }) {
    const localData = loadLocalDb();
    if (!localData.otp_codes) localData.otp_codes = [];
    const nowIso = new Date().toISOString();
    const otpObj = {
      id: `otp_${crypto.randomBytes(6).toString('hex')}`,
      email_normalized: this.normalizeEmail(email_normalized),
      hashed_code,
      raw_code: raw_code || null,
      purpose: purpose || 'login',
      expires_at: expires_at || new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      used_at: null,
      attempts: 0,
      created_at: nowIso
    };
    localData.otp_codes.push(otpObj);
    saveLocalDb(localData);
    return otpObj;
  },

  async getActiveOtp(email_normalized, purpose) {
    const localData = loadLocalDb();
    const normalized = this.normalizeEmail(email_normalized);
    const now = new Date();
    const list = (localData.otp_codes || [])
      .filter(o => o.email_normalized === normalized && o.purpose === purpose && !o.used_at && new Date(o.expires_at) > now && (o.attempts || 0) < 5)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return list[0] || null;
  },

  async markOtpUsed(id) {
    const localData = loadLocalDb();
    const otp = (localData.otp_codes || []).find(o => o.id === id);
    if (otp) {
      otp.used_at = new Date().toISOString();
      saveLocalDb(localData);
    }
    return true;
  },

  async incrementOtpAttempts(id) {
    const localData = loadLocalDb();
    const otp = (localData.otp_codes || []).find(o => o.id === id);
    if (otp) {
      otp.attempts = (otp.attempts || 0) + 1;
      saveLocalDb(localData);
      return otp.attempts;
    }
    return 0;
  },

  async getRecentOtpCount(email_normalized, windowMinutes = 5) {
    const localData = loadLocalDb();
    const normalized = this.normalizeEmail(email_normalized);
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
    return (localData.otp_codes || []).filter(o => o.email_normalized === normalized && new Date(o.created_at) > cutoff).length;
  },

  // =========================================================================
  // Subscriptions & Plans
  // =========================================================================

  async getSubscription(userId, email = null) {
    if (!userId && !email) return null;
    const subs = await this.getAllSubscriptions();
    const normalized = email ? this.normalizeEmail(email) : null;
    return subs.find(s => 
      (userId && s.user_id === userId) ||
      (normalized && (s.user_id === normalized || s.user_email === normalized || s.email === normalized))
    ) || null;
  },

  async upsertSubscription(userId, data) {
    if (!userId && !data?.user_email && !data?.email) return null;
    let subs = await this.getAllSubscriptions();
    if (!Array.isArray(subs)) subs = [];
    const nowIso = new Date().toISOString();
    const targetEmail = data?.user_email || data?.email || null;
    const normEmail = targetEmail ? this.normalizeEmail(targetEmail) : null;
    const idx = subs.findIndex(s => 
      (userId && s.user_id === userId) ||
      (normEmail && (s.user_id === normEmail || s.user_email === normEmail || s.email === normEmail))
    );
    let result = null;
    if (idx !== -1) {
      subs[idx] = {
        ...subs[idx],
        ...data,
        updated_at: nowIso
      };
      result = subs[idx];
    } else {
      result = {
        id: `sub_${crypto.randomBytes(6).toString('hex')}`,
        user_id: userId,
        user_email: normEmail,
        plan: data.plan || 'free',
        status: data.status || 'active',
        billing_start: data.billing_start || nowIso,
        billing_end: data.billing_end || null,
        promo_end: data.promo_end || null,
        created_at: nowIso,
        ...data
      };
      subs.push(result);
    }
    await saveStorageJson('subscriptions', subs);

    const localData = loadLocalDb();
    if (!localData.subscriptions) localData.subscriptions = [];
    const localIdx = localData.subscriptions.findIndex(s => 
      (userId && s.user_id === userId) ||
      (normEmail && (s.user_id === normEmail || s.user_email === normEmail || s.email === normEmail))
    );
    if (localIdx !== -1) {
      localData.subscriptions[localIdx] = result;
    } else {
      localData.subscriptions.push(result);
    }
    saveLocalDb(localData);

    return result;
  },

  async getAllSubscriptions() {
    let rawSubs = null;
    const storageSubs = await loadStorageJson('subscriptions', null);
    if (storageSubs && Array.isArray(storageSubs)) {
      rawSubs = storageSubs;
    } else {
      const localData = loadLocalDb();
      rawSubs = localData.subscriptions || [];
    }
    const dedupedMap = new Map();
    for (const sub of rawSubs) {
      if (!sub) continue;
      const key = sub.user_id || sub.id || sub.user_email || sub.email;
      if (!key) continue;
      const existing = dedupedMap.get(key);
      if (!existing) {
        dedupedMap.set(key, sub);
      } else {
        const existingTime = new Date(existing.updated_at || existing.created_at || 0).getTime();
        const thisTime = new Date(sub.updated_at || sub.created_at || 0).getTime();
        if (thisTime >= existingTime) {
          dedupedMap.set(key, sub);
        }
      }
    }
    return Array.from(dedupedMap.values());
  },

  // =========================================================================
  // Monthly Usage Limits
  // =========================================================================

  async getMonthlyUsage(userId, periodMonth = null) {
    const month = periodMonth || new Date().toISOString().slice(0, 7);
    if (!userId) return { user_id: userId, period_month: month, uploads_used: 0, ai_usage: 0 };

    let allUsage = await loadStorageJson('usage', null);
    if (!allUsage || !Array.isArray(allUsage)) {
      const localData = loadLocalDb();
      allUsage = localData.usage || [];
    }

    let item = allUsage.find(u => u.user_id === userId && u.period_month === month);
    let recordedUploads = item ? (item.uploads_used || 0) : 0;

    // Ground Truth reconciliation: Count user's actual posts published or scheduled in this calendar month
    try {
      const userPosts = await this.getAllPosts(userId);
      const postsThisMonth = (userPosts || []).filter(p => {
        if (!p || p.status === 'Draft' || p.status === 'Failed') return false;
        const postDate = p.date || p.createdAt || p.scheduledAt;
        if (!postDate) return false;
        try {
          return new Date(postDate).toISOString().slice(0, 7) === month;
        } catch (_) {
          return false;
        }
      });
      const postCountThisMonth = postsThisMonth.length;
      if (postCountThisMonth > recordedUploads) {
        recordedUploads = postCountThisMonth;
        await this.setMonthlyUploads(userId, recordedUploads, month);
      }
    } catch (_) {}

    return {
      user_id: userId,
      period_month: month,
      uploads_used: recordedUploads,
      ai_usage: item ? (item.ai_usage || 0) : 0
    };
  },

  async setMonthlyUploads(userId, count, periodMonth = null) {
    if (!userId) return;
    const month = periodMonth || new Date().toISOString().slice(0, 7);
    let allUsage = await loadStorageJson('usage', null);
    if (!allUsage || !Array.isArray(allUsage)) {
      const localData = loadLocalDb();
      allUsage = localData.usage || [];
    }
    const nowIso = new Date().toISOString();
    let item = allUsage.find(u => u.user_id === userId && u.period_month === month);
    if (item) {
      item.uploads_used = Math.max(item.uploads_used || 0, count);
      item.updated_at = nowIso;
    } else {
      item = {
        id: `usg_${crypto.randomBytes(6).toString('hex')}`,
        user_id: userId,
        period_month: month,
        uploads_used: count,
        ai_usage: 0,
        updated_at: nowIso
      };
      allUsage.push(item);
    }
    await saveStorageJson('usage', allUsage);

    const localData = loadLocalDb();
    if (!localData.usage) localData.usage = [];
    const localIdx = localData.usage.findIndex(u => u.user_id === userId && u.period_month === month);
    if (localIdx !== -1) {
      localData.usage[localIdx] = item;
    } else {
      localData.usage.push(item);
    }
    saveLocalDb(localData);
    return item;
  },

  async incrementMonthlyUploads(userId, periodMonth = null) {
    if (!userId) return;
    const month = periodMonth || new Date().toISOString().slice(0, 7);
    let allUsage = await loadStorageJson('usage', null);
    if (!allUsage || !Array.isArray(allUsage)) {
      const localData = loadLocalDb();
      allUsage = localData.usage || [];
    }
    const nowIso = new Date().toISOString();
    let item = allUsage.find(u => u.user_id === userId && u.period_month === month);
    if (item) {
      item.uploads_used = (item.uploads_used || 0) + 1;
      item.updated_at = nowIso;
    } else {
      item = {
        id: `usg_${crypto.randomBytes(6).toString('hex')}`,
        user_id: userId,
        period_month: month,
        uploads_used: 1,
        ai_usage: 0,
        updated_at: nowIso
      };
      allUsage.push(item);
    }
    await saveStorageJson('usage', allUsage);

    const localData = loadLocalDb();
    if (!localData.usage) localData.usage = [];
    const localIdx = localData.usage.findIndex(u => u.user_id === userId && u.period_month === month);
    if (localIdx !== -1) {
      localData.usage[localIdx] = item;
    } else {
      localData.usage.push(item);
    }
    saveLocalDb(localData);
    return item;
  },

  async resetMonthlyUploads(userId, periodMonth = null) {
    if (!userId) return;
    const month = periodMonth || new Date().toISOString().slice(0, 7);
    let allUsage = await loadStorageJson('usage', null);
    if (!allUsage || !Array.isArray(allUsage)) {
      const localData = loadLocalDb();
      allUsage = localData.usage || [];
    }
    const nowIso = new Date().toISOString();
    let item = allUsage.find(u => u.user_id === userId && u.period_month === month);
    if (item) {
      item.uploads_used = 0;
      item.updated_at = nowIso;
    } else {
      item = {
        id: `usg_${crypto.randomBytes(6).toString('hex')}`,
        user_id: userId,
        period_month: month,
        uploads_used: 0,
        ai_usage: 0,
        updated_at: nowIso
      };
      allUsage.push(item);
    }
    await saveStorageJson('usage', allUsage);

    const localData = loadLocalDb();
    if (!localData.usage) localData.usage = [];
    const localIdx = localData.usage.findIndex(u => u.user_id === userId && u.period_month === month);
    if (localIdx !== -1) {
      localData.usage[localIdx] = item;
    } else {
      localData.usage.push(item);
    }
    saveLocalDb(localData);
    return item;
  },

  async getAllUsage(periodMonth = null) {
    const month = periodMonth || new Date().toISOString().slice(0, 7);
    const storageUsage = await loadStorageJson('usage', null);
    if (storageUsage && Array.isArray(storageUsage)) {
      return (storageUsage || []).filter(u => !periodMonth || u.period_month === month);
    }
    const localData = loadLocalDb();
    return (localData.usage || []).filter(u => !periodMonth || u.period_month === month);
  },

  // =========================================================================
  // Free Members (Admin-granted free access)
  // =========================================================================

  async getFreeMember(email_normalized) {
    const normalized = this.normalizeEmail(email_normalized);
    const members = await this.getAllFreeMembers();
    return members.find(m => m.email_normalized === normalized && m.status === 'active') || null;
  },

  async getAllFreeMembers() {
    const storageMembers = await loadStorageJson('free_members', null);
    if (storageMembers && Array.isArray(storageMembers)) {
      return storageMembers;
    }
    const localData = loadLocalDb();
    return localData.free_members || [];
  },

  async addFreeMember({ email, plan = 'creator_pro', duration = '14 days', expiry_date = null, created_by = 'explorewithharizz@gmail.com' }) {
    const normalized = this.normalizeEmail(email);
    let members = await this.getAllFreeMembers();
    if (!Array.isArray(members)) members = [];

    let calculatedExpiry = expiry_date;
    const now = new Date();
    if (!calculatedExpiry) {
      if (duration === 'Permanent') {
        calculatedExpiry = 'permanent';
      } else {
        const days = parseInt(duration, 10) || 14;
        calculatedExpiry = new Date(now.getTime() + days * 86400 * 1000).toISOString();
      }
    }

    const existingIdx = members.findIndex(m => m.email_normalized === normalized);
    const memberObj = {
      id: existingIdx >= 0 ? members[existingIdx].id : `fm_${crypto.randomBytes(6).toString('hex')}`,
      email_normalized: normalized,
      email: normalized,
      plan: plan || 'creator_pro',
      duration,
      start_date: now.toISOString(),
      expiry_date: calculatedExpiry,
      created_by,
      status: 'active',
      created_at: now.toISOString()
    };

    if (existingIdx >= 0) {
      members[existingIdx] = memberObj;
    } else {
      members.unshift(memberObj);
    }
    await saveStorageJson('free_members', members);

    const localData = loadLocalDb();
    if (!localData.free_members) localData.free_members = [];
    const localIdx = localData.free_members.findIndex(m => m.email_normalized === normalized);
    if (localIdx >= 0) {
      localData.free_members[localIdx] = memberObj;
    } else {
      localData.free_members.unshift(memberObj);
    }
    saveLocalDb(localData);

    return memberObj;
  },

  async removeFreeMember(id) {
    let members = await this.getAllFreeMembers();
    const item = members.find(m => m.id === id || m.email_normalized === id);
    if (item) {
      item.status = 'revoked';
      await saveStorageJson('free_members', members);

      const localData = loadLocalDb();
      const localItem = (localData.free_members || []).find(m => m.id === id || m.email_normalized === id);
      if (localItem) {
        localItem.status = 'revoked';
        saveLocalDb(localData);
      }
      return true;
    }
    return false;
  },

  // =========================================================================
  // Coupons & Redemptions
  // =========================================================================

  async getCouponByCode(code) {
    if (!code) return null;
    const clean = String(code).trim().toUpperCase();
    const storageCoupons = await loadStorageJson('coupons', null);
    const localData = loadLocalDb();
    const sourceCoupons = (storageCoupons && storageCoupons.length > 0) ? storageCoupons : (localData.coupons || []);
    let found = sourceCoupons.find(c => (c.code || '').toUpperCase() === clean);
    if (!found) {
      // Force bypass cache once in case admin recently created it
      delete storageCache['coupons'];
      delete storageCache['coupons_time'];
      const freshCoupons = await loadStorageJson('coupons', []);
      found = freshCoupons.find(c => (c.code || '').toUpperCase() === clean);
    }
    return found || null;
  },

  async getAllCoupons() {
    const storageCoupons = await loadStorageJson('coupons', null);
    if (storageCoupons && Array.isArray(storageCoupons) && storageCoupons.length > 0) {
      return storageCoupons;
    }
    const localData = loadLocalDb();
    return localData.coupons || [];
  },

  async createCoupon(data) {
    const code = String(data.code).trim().toUpperCase();
    let currentCoupons = await this.getAllCoupons();
    if (!Array.isArray(currentCoupons)) currentCoupons = [];
    const existing = currentCoupons.find(c => (c.code || '').toUpperCase() === code);
    if (existing) {
      throw new Error(`Coupon with code ${code} already exists.`);
    }

    const discountVal = Number(data.discount_value) || 0;
    const discountType = data.discount_type || (discountVal >= 100 ? 'free' : 'percentage');

    const maxUses = (data.max_uses !== undefined && data.max_uses !== null && String(data.max_uses).trim() !== '' && Number(data.max_uses) > 0)
      ? Number(data.max_uses)
      : null;

    const cpn = {
      id: `cpn_${crypto.randomBytes(6).toString('hex')}`,
      code,
      discount_type: discountType,
      discount_value: discountType === 'free' ? 100 : discountVal,
      valid_from: data.valid_from || new Date().toISOString(),
      valid_until: data.valid_until || new Date(Date.now() + 365 * 86400 * 1000).toISOString(),
      max_uses: maxUses,
      uses_count: 0,
      uses_per_user: Number(data.uses_per_user) || 1,
      applicable_plan: data.applicable_plan || 'creator_pro',
      premium_duration_days: Number(data.premium_duration_days) || 14,
      active: data.active !== false,
      created_at: new Date().toISOString()
    };

    currentCoupons.unshift(cpn);
    await saveStorageJson('coupons', currentCoupons);

    const localData = loadLocalDb();
    if (!localData.coupons) localData.coupons = [];
    localData.coupons.unshift(cpn);
    saveLocalDb(localData);

    return cpn;
  },

  async updateCoupon(id, updates) {
    const query = String(id || '').trim().toUpperCase();
    let currentCoupons = await this.getAllCoupons();
    const cpn = currentCoupons.find(c => c.id === id || (c.code || '').toUpperCase() === query);
    if (cpn) {
      Object.assign(cpn, updates);
      await saveStorageJson('coupons', currentCoupons);

      const localData = loadLocalDb();
      const localCpn = (localData.coupons || []).find(c => c.id === id || (c.code || '').toUpperCase() === query);
      if (localCpn) {
        Object.assign(localCpn, updates);
        saveLocalDb(localData);
      }
      return cpn;
    }
    return null;
  },

  async deleteCoupon(id) {
    const query = String(id || '').trim().toUpperCase();
    let currentCoupons = await this.getAllCoupons();
    const filtered = currentCoupons.filter(c => c.id !== id && (c.code || '').toUpperCase() !== query);
    if (filtered.length !== currentCoupons.length) {
      await saveStorageJson('coupons', filtered);

      const localData = loadLocalDb();
      if (localData.coupons) {
        localData.coupons = localData.coupons.filter(c => c.id !== id && (c.code || '').toUpperCase() !== query);
        saveLocalDb(localData);
      }
      return true;
    }
    return false;
  },

  async recordCouponRedemption({ coupon_id, coupon_code, user_id, discount_amount, access_start, access_end, plan }) {
    let redemptions = await this.getAllCouponRedemptions();
    if (!Array.isArray(redemptions)) redemptions = [];

    const redemption = {
      id: `red_${crypto.randomBytes(6).toString('hex')}`,
      coupon_id,
      coupon_code: String(coupon_code).toUpperCase(),
      user_id,
      discount_amount: discount_amount || 0,
      claimed_at: new Date().toISOString(),
      access_start: access_start || new Date().toISOString(),
      access_end: access_end || null,
      plan: plan || 'creator_pro'
    };
    redemptions.unshift(redemption);
    await saveStorageJson('coupon_redemptions', redemptions);

    // Increment coupon uses count in storage
    let currentCoupons = await this.getAllCoupons();
    const cpn = currentCoupons.find(c => c.id === coupon_id || (c.code || '').toUpperCase() === redemption.coupon_code);
    if (cpn) {
      cpn.uses_count = (cpn.uses_count || 0) + 1;
      await saveStorageJson('coupons', currentCoupons);
    }

    const localData = loadLocalDb();
    if (!localData.coupon_redemptions) localData.coupon_redemptions = [];
    localData.coupon_redemptions.unshift(redemption);
    const localCpn = (localData.coupons || []).find(c => c.id === coupon_id || (c.code || '').toUpperCase() === redemption.coupon_code);
    if (localCpn) {
      localCpn.uses_count = (localCpn.uses_count || 0) + 1;
    }
    saveLocalDb(localData);

    return redemption;
  },

  async getUserCouponRedemptions(userId, email = null) {
    if (!userId && !email) return [];
    const redemptions = await this.getAllCouponRedemptions();
    const normalized = email ? this.normalizeEmail(email) : null;
    return redemptions.filter(r => 
      (userId && r.user_id === userId) ||
      (normalized && (r.user_id === normalized || r.user_email === normalized || r.email === normalized))
    );
  },

  async getAllCouponRedemptions() {
    const storageRedemptions = await loadStorageJson('coupon_redemptions', null);
    if (storageRedemptions && Array.isArray(storageRedemptions)) {
      return storageRedemptions;
    }
    const localData = loadLocalDb();
    return localData.coupon_redemptions || [];
  },

  // =========================================================================
  // Activity Logs & Payments
  // =========================================================================

  async logActivity(userId, action, metadata = {}) {
    const localData = loadLocalDb();
    if (!localData.activity_logs) localData.activity_logs = [];
    const logObj = {
      id: `act_${crypto.randomBytes(6).toString('hex')}`,
      user_id: userId || 'system',
      action,
      metadata,
      created_at: new Date().toISOString()
    };
    localData.activity_logs.unshift(logObj);
    if (localData.activity_logs.length > 500) {
      localData.activity_logs = localData.activity_logs.slice(0, 500);
    }
    saveLocalDb(localData);
    return logObj;
  },

  async getActivityLogs(limit = 100) {
    const localData = loadLocalDb();
    return (localData.activity_logs || []).slice(0, limit);
  },

  async recordPayment(data) {
    const payObj = {
      id: `pay_${crypto.randomBytes(6).toString('hex')}`,
      user_id: data.user_id,
      amount: Number(data.amount) || 0,
      currency: data.currency || 'INR',
      plan: data.plan || 'creator_pro',
      status: data.status || 'completed',
      created_at: new Date().toISOString()
    };
    try {
      const storagePayments = await loadStorageJson('payments', []);
      storagePayments.unshift(payObj);
      await saveStorageJson('payments', storagePayments);
    } catch (e) {}

    const localData = loadLocalDb();
    if (!localData.payments) localData.payments = [];
    localData.payments.unshift(payObj);
    saveLocalDb(localData);
    return payObj;
  },

  async getPayments(limit = 100) {
    try {
      const storagePayments = await loadStorageJson('payments', null);
      if (storagePayments && Array.isArray(storagePayments)) {
        return storagePayments.slice(0, limit);
      }
    } catch (e) {}
    const localData = loadLocalDb();
    return (localData.payments || []).slice(0, limit);
  },

  async getAllConnectedAccounts() {
    try {
      const res = await supabaseFetch('social_accounts?status=neq.revoked&select=*');
      if (res.ok) {
        const rows = await res.json();
        let allMapped = [];
        for (const row of rows) {
          allMapped = allMapped.concat(mapRowToAccounts(row));
        }
        return allMapped;
      }
    } catch (e) {}
    const localData = loadLocalDb();
    return (localData.socialAccounts || []).filter(s => s.status !== 'revoked');
  },

  async getAdminOverviewStats() {
    if (adminOverviewCache && (Date.now() - adminOverviewCacheTime < 20000)) {
      return adminOverviewCache;
    }

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const monthStr = now.toISOString().slice(0, 7);

    const [users, freeMembersList, couponsList, subsList, redemptionsList, usageList] = await Promise.all([
      this.getAllUsers(),
      this.getAllFreeMembers(),
      this.getAllCoupons(),
      this.getAllSubscriptions(),
      this.getAllCouponRedemptions(),
      this.getAllUsage()
    ]);

    const freeMembers = (freeMembersList || []).filter(m => m.status === 'active' && (m.expiry_date === 'permanent' || !m.expiry_date || new Date(m.expiry_date) > now));
    const activeCoupons = (couponsList || []).filter(c => c.active && (!c.valid_until || new Date(c.valid_until) >= now));
    const expiredCoupons = (couponsList || []).filter(c => !c.active || (c.valid_until && new Date(c.valid_until) < now));

    let freeUsers = 0;
    let creatorProUsers = 0;
    let agencyUsers = 0;

    for (const u of (users || [])) {
      if (u.role === 'admin' || (u.email || '').toLowerCase() === 'explorewithharizz@gmail.com') {
        agencyUsers++;
        continue;
      }
      const isFm = freeMembers.find(m => m.email_normalized === (u.email_normalized || (u.email || '').toLowerCase()));
      if (isFm) {
        if (isFm.plan === 'agency_scale') agencyUsers++;
        else creatorProUsers++;
        continue;
      }
      const sub = (subsList || []).find(s => s.user_id === u.id && s.status === 'active' && (!s.billing_end || new Date(s.billing_end) > now));
      if (sub && sub.plan === 'agency_scale') agencyUsers++;
      else if (sub && sub.plan === 'creator_pro') creatorProUsers++;
      else {
        const red = (redemptionsList || []).find(r => r.user_id === u.id && (!r.access_end || new Date(r.access_end) > now));
        if (red && red.plan === 'agency_scale') agencyUsers++;
        else if (red) creatorProUsers++;
        else if (u.plan === 'agency_scale') agencyUsers++;
        else if (u.plan === 'creator_pro') creatorProUsers++;
        else freeUsers++;
      }
    }

    // Uploads
    let posts = [];
    try {
      const res = await supabaseFetch('posts?select=id,status,created_at,published_at&order=created_at.desc&limit=1000');
      if (res.ok) posts = await res.json();
    } catch (e) {}
    if (!posts || posts.length === 0) {
      const localData = loadLocalDb();
      posts = localData.posts || [];
    }

    const uploadsToday = posts.filter(p => (p.status === 'Published' || p.status === 'completed' || p.status === 'published') && (p.published_at || p.created_at || '').slice(0, 10) === todayStr).length;
    const uploadsThisMonthFromUsage = (usageList || []).filter(u => u.period_month === monthStr).reduce((sum, u) => sum + (Number(u.uploads_used) || 0), 0);
    const uploadsThisMonthFromPosts = posts.filter(p => (p.status === 'Published' || p.status === 'completed' || p.status === 'published') && (p.published_at || p.created_at || '').slice(0, 7) === monthStr).length;
    const uploadsThisMonth = Math.max(uploadsThisMonthFromPosts, uploadsThisMonthFromUsage);

    // Payments & Revenue
    const payments = await this.getPayments(500);
    const totalRevenue = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    // Social connections
    let activeSocialConnections = 0;
    try {
      const res = await supabaseFetch('social_accounts?status=neq.revoked&select=id');
      if (res.ok) {
        const rows = await res.json();
        activeSocialConnections = rows.length;
      }
    } catch (e) {}
    if (activeSocialConnections === 0) {
      const localData = loadLocalDb();
      activeSocialConnections = (localData.socialAccounts || []).filter(s => s.status !== 'revoked').length;
    }

    const result = {
      totalUsers: (users || []).length,
      freeUsers,
      creatorProUsers,
      agencyUsers,
      freeMembersCount: freeMembers.length,
      freeAccessMembers: freeMembers.length,
      activeCoupons: activeCoupons.length,
      expiredCoupons: expiredCoupons.length,
      uploadsToday,
      uploadsThisMonth,
      revenue: totalRevenue,
      totalRevenue: totalRevenue,
      activeSocialConnections
    };
    adminOverviewCache = result;
    adminOverviewCacheTime = Date.now();
    return result;
  },

  async saveContactInquiry(inquiry) {
    const localData = loadLocalDb();
    if (!Array.isArray(localData.contact_inquiries)) {
      localData.contact_inquiries = [];
    }
    const record = {
      id: 'inq_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      name: inquiry.name,
      email: inquiry.email,
      gmail: inquiry.gmail || inquiry.email,
      message: inquiry.message,
      ip: inquiry.ip || '',
      created_at: new Date().toISOString()
    };
    localData.contact_inquiries.unshift(record);
    saveLocalDb(localData);
    console.log(`[DB] Saved contact inquiry from ${record.email} (${record.id})`);
    return record;
  },

  async getContactInquiries(limit = 100) {
    const localData = loadLocalDb();
    return (localData.contact_inquiries || []).slice(0, limit);
  },

  loadLocalDb,
  saveLocalDb,
  supabaseFetch
};
db.supabaseFetch = supabaseFetch;
module.exports = db;
module.exports.supabaseFetch = supabaseFetch;
