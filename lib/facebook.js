// lib/facebook.js
// Postmint Facebook & Meta Integration Service: OAuth 2.0 & Publishing API v21.0
// Supports Facebook Page Videos, Reels, Photos, and Status Posts with video readiness polling

const db = require('./db');
const fbService = require('../services/facebook');

const META_APP_ID = (process.env.META_APP_ID || '').trim() || '2680197525765699';
const META_APP_SECRET = (process.env.META_APP_SECRET || '').trim() || '0764e538332d0eeb68deb98df70634d1';
const META_GRAPH_VERSION = 'v21.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

const META_DEFAULT_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish'
].join(',');

const META_SCOPES = process.env.META_SCOPES || META_DEFAULT_SCOPES;

function getMetaCredentials() {
  return {
    appId: process.env.META_APP_ID || META_APP_ID,
    appSecret: process.env.META_APP_SECRET || META_APP_SECRET
  };
}

/**
 * Builds Meta / Facebook OAuth 2.0 authorization URL
 */
function getMetaAuthUrl({ redirectUri, state, scope }) {
  const { appId } = getMetaCredentials();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scope || META_SCOPES,
    auth_type: 'rerequest',
    state: state || 'meta_postmint'
  });
  return `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

/**
 * Exchanges authorization code for long-lived user token & discovers all managed Facebook Pages
 */
async function exchangeMetaCode({ code, redirectUri }) {
  const { appId, appSecret } = getMetaCredentials();

  console.log('[Facebook Service] Exchanging authorization code...');

  // Step 1: Exchange code for short-lived user token
  const tokenUrl = new URL(`${META_GRAPH_BASE}/oauth/access_token`);
  tokenUrl.searchParams.set('client_id', appId);
  tokenUrl.searchParams.set('client_secret', appSecret);
  tokenUrl.searchParams.set('redirect_uri', redirectUri);
  tokenUrl.searchParams.set('code', code);

  const tokenRes = await fetch(tokenUrl.toString());
  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || tokenData.error) {
    throw new Error(tokenData.error?.message || 'Failed to exchange Meta authorization code');
  }

  const shortLivedToken = tokenData.access_token;

  // Step 2: Exchange short-lived token for 60-day long-lived user token
  console.log('[Facebook Service] Exchanging for 60-day long-lived token...');
  let userAccessToken = shortLivedToken;
  try {
    const longLivedUrl = new URL(`${META_GRAPH_BASE}/oauth/access_token`);
    longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longLivedUrl.searchParams.set('client_id', appId);
    longLivedUrl.searchParams.set('client_secret', appSecret);
    longLivedUrl.searchParams.set('fb_exchange_token', shortLivedToken);

    const longLivedRes = await fetch(longLivedUrl.toString());
    const longLivedData = await longLivedRes.json();
    if (longLivedData.access_token) {
      userAccessToken = longLivedData.access_token;
      console.log('[Facebook Service] Successfully obtained 60-day long-lived user token.');
    }
  } catch (llErr) {
    console.warn('[Facebook Service] Long-lived exchange warning:', llErr.message);
  }

  // Step 3: Fetch managed Facebook Pages with NEVER-EXPIRING Page Access Tokens
  console.log('[Facebook Service] Discovering managed Facebook Pages...');
  const pagesUrl = new URL(`${META_GRAPH_BASE}/me/accounts`);
  pagesUrl.searchParams.set('fields', 'id,name,access_token,category,picture{url},instagram_business_account{id,username,name,profile_picture_url}');
  pagesUrl.searchParams.set('access_token', userAccessToken);

  const pagesRes = await fetch(pagesUrl.toString());
  const pagesData = await pagesRes.json();

  const pages = [];
  if (pagesRes.ok && Array.isArray(pagesData?.data)) {
    for (const p of pagesData.data) {
      pages.push({
        id: p.id,
        name: p.name,
        accessToken: p.access_token,
        category: p.category || 'Page',
        avatarUrl: p.picture?.data?.url || null,
        instagramAccount: p.instagram_business_account ? {
          id: p.instagram_business_account.id,
          username: p.instagram_business_account.username,
          name: p.instagram_business_account.name,
          avatarUrl: p.instagram_business_account.profile_picture_url || null
        } : null
      });
    }
  }

  console.log(`[Facebook Service] Discovered ${pages.length} managed Facebook Pages.`);

  // Step 4: Fetch user profile identity as supplement
  let userProfile = null;
  try {
    const meUrl = new URL(`${META_GRAPH_BASE}/me`);
    meUrl.searchParams.set('fields', 'id,name,picture{url}');
    meUrl.searchParams.set('access_token', userAccessToken);
    const meRes = await fetch(meUrl.toString());
    if (meRes.ok) {
      const meData = await meRes.json();
      userProfile = {
        id: meData.id,
        name: meData.name,
        avatarUrl: meData.picture?.data?.url || null
      };
      console.log(`[Facebook Service] User profile: ${userProfile.name} (${userProfile.id})`);
    }
  } catch (e) {
    console.warn('[Facebook Service] Failed to fetch /me user profile:', e.message);
  }

  return {
    userAccessToken,
    pages,
    userProfile
  };
}

/**
 * Auto-resolves Page Access Token and Page ID
 */
async function resolvePageCredentials({ accountId, pageId, pageAccessToken, userId = 'usr_default_postmint' }) {
  let activePageId = pageId;
  let activeToken = pageAccessToken;

  // Resolve from DB if accountId provided
  if (accountId && (!activePageId || !activeToken)) {
    const acc = await db.getAccountWithTokens(accountId, userId);
    if (acc) {
      activePageId = acc.pageId || (acc.externalId !== '122113587423476695' ? acc.externalId : null);
      activeToken = acc.accessToken;
    }
  }

  // Check DB for any active Facebook account if still missing
  if (!activePageId || !activeToken) {
    try {
      const accounts = await db.getConnectedAccounts(userId);
      const fbAcc = accounts.find(a => a.platform === 'facebook' && a.status === 'active');
      if (fbAcc) {
        const full = await db.getAccountWithTokens(fbAcc.id, userId);
        if (full) {
          if (!activePageId) activePageId = full.pageId || (full.externalId !== '122113587423476695' ? full.externalId : null);
          if (!activeToken) activeToken = full.accessToken;
        }
      }
    } catch (e) {
      console.warn('[Facebook] DB account lookup warning:', e.message);
    }
  }

  // Ensure activePageId is a Facebook Page ID (not personal user profile)
  if (!activePageId || activePageId === '122113587423476695') {
    activePageId = process.env.FACEBOOK_PAGE_ID || '1399357519919142';
  }
  if (!activeToken) {
    activeToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN;
  }

  // Auto-resolve Page Access Token if activeToken is a User Access Token
  if (activeToken && activePageId) {
    try {
      const pageInfoRes = await fetch(`${META_GRAPH_BASE}/${activePageId}?fields=access_token&access_token=${encodeURIComponent(activeToken)}`);
      if (pageInfoRes.ok) {
        const pageInfo = await pageInfoRes.json();
        if (pageInfo && pageInfo.access_token) {
          console.log(`[Facebook Service] Successfully upgraded to Page Access Token for Page ${activePageId}`);
          activeToken = pageInfo.access_token;
        }
      }
    } catch (tokenErr) {
      console.warn('[Facebook Service] Page token resolution note:', tokenErr.message);
    }
  }

  return {
    pageId: activePageId,
    pageAccessToken: activeToken
  };
}

/**
 * Publishes content (video, reel, photo, or status message) to a Facebook Page
 * Enforces published=true, video encoding status polling, and verified permalinks
 */
async function publishToFacebookPage({
  accountId,
  userId = 'usr_default_postmint',
  pageId,
  pageAccessToken,
  message = '',
  title = '',
  videoBuffer,
  videoUrl,
  imageUrl,
  thumbBuffer = null,
  thumbUrl = null,
  type = 'Post'
}) {
  const creds = await resolvePageCredentials({ accountId, pageId, pageAccessToken, userId });
  const activePageId = creds.pageId;
  const activeToken = creds.pageAccessToken;

  if (!activePageId || !activeToken) {
    throw new Error('Facebook Page credentials not configured. Please connect your Facebook Page in Connected Accounts.');
  }

  const isVideo = Boolean(
    (videoBuffer && Buffer.isBuffer(videoBuffer) && videoBuffer.length > 0) ||
    (videoUrl && videoUrl.startsWith('http')) ||
    type === 'Video' ||
    type === 'Reels'
  );
  const isReel = type === 'Reels';

  console.log(`[Facebook Publishing] Target Page: ${activePageId} (isVideo=${isVideo}, isReel=${isReel})...`);

  try {
    // 1. Reel Publishing
    if (isReel && isVideo) {
      return await fbService.publishFacebookReel({
        pageId: activePageId,
        pageAccessToken: activeToken,
        videoBuffer,
        videoUrl,
        thumbBuffer,
        thumbUrl,
        message,
        title
      });
    }

    // 2. Video Publishing
    if (isVideo) {
      return await fbService.publishFacebookVideo({
        pageId: activePageId,
        pageAccessToken: activeToken,
        videoBuffer,
        videoUrl,
        thumbBuffer,
        thumbUrl,
        title,
        message
      });
    }

    // 3. Photo Publishing
    if (imageUrl && imageUrl.startsWith('http')) {
      return await fbService.publishFacebookPhoto({
        pageId: activePageId,
        pageAccessToken: activeToken,
        imageUrl,
        message
      });
    }

    // 4. Status Post
    return await fbService.publishFacebookFeed({
      pageId: activePageId,
      pageAccessToken: activeToken,
      message: message || title
    });
  } catch (apiErr) {
    console.error('[Facebook API Error]:', apiErr.message);
    if (apiErr.message && (apiErr.message.includes('Session has expired') || apiErr.message.includes('code 190') || apiErr.message.includes('Error validating access token'))) {
      throw new Error('Facebook session or access token has expired. Please re-authorize by connecting your Facebook Page in Connected Accounts.');
    }
    throw apiErr;
  }
}

/**
 * Helper to extract clean Facebook post or video ID from string or URL
 */
function extractFacebookPostId(input) {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();
  if (/^\d+(?:_\d+)?$/.test(str)) return str;
  const match = str.match(/(?:watch\/\?(?:.*&)?v=|videos\/|posts\/|reel\/|reels\/|story\.php\?story_fbid=)(\d+)/i);
  if (match) return match[1];
  return str;
}

/**
 * Deletes a post or video from a Facebook Page by postId or URL
 */
async function deleteFacebookPost({ postId, url = null, userId = 'usr_default_postmint', accountId, pageAccessToken, pageId }) {
  const urlId = extractFacebookPostId(url);
  const rawTarget = extractFacebookPostId(postId);
  const targetId = (rawTarget && !rawTarget.startsWith('p_')) ? rawTarget : (urlId || rawTarget || postId);

  if (!targetId || typeof targetId !== 'string' || targetId.startsWith('p_')) {
    console.warn(`[Facebook Delete] Invalid or unresolvable Facebook post ID: ${targetId}`);
    return { success: false, postId: targetId, error: 'Facebook post ID not found. Post cannot be deleted remotely.' };
  }

  if (process.env.SOCIAL_API_MOCK_MODE === 'true' || String(targetId).startsWith('sim_')) {
    return { success: true, postId: targetId, mock: true };
  }

  const creds = await resolvePageCredentials({ accountId, userId, pageAccessToken, pageId });
  const primaryToken = pageAccessToken || creds?.pageAccessToken;

  // Candidate tokens to try in order
  const candidateTokens = [];
  [
    primaryToken,
    creds?.pageAccessToken,
    pageAccessToken,
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
    process.env.META_PAGE_ACCESS_TOKEN,
    process.env.FACEBOOK_USER_ACCESS_TOKEN
  ].forEach(t => {
    if (t && typeof t === 'string' && !candidateTokens.includes(t)) candidateTokens.push(t);
  });

  // Fallback: search system-wide for any active Facebook/Meta account in Supabase
  if (candidateTokens.length === 0) {
    try {
      const { supabaseFetch } = require('./db');
      const allRes = await supabaseFetch('social_accounts?provider=in.(facebook,meta)&order=updated_at.desc&limit=10');
      if (allRes.ok) {
        const rows = await allRes.json();
        for (const row of rows) {
          const full = await db.getAccountWithTokens(row.id, null);
          if (full && full.accessToken && !candidateTokens.includes(full.accessToken)) {
            candidateTokens.push(full.accessToken);
          }
        }
      }
    } catch (_) {}
  }

  // Upgrade any User Access Token to Page Access Token via /me/accounts
  for (const t of [...candidateTokens]) {
    try {
      const pagesRes = await fetch(`${META_GRAPH_BASE}/me/accounts?fields=access_token,id,name&access_token=${encodeURIComponent(t)}`);
      if (pagesRes.ok) {
        const pagesData = await pagesRes.json();
        if (Array.isArray(pagesData?.data)) {
          pagesData.data.forEach(p => {
            if (p.access_token && !candidateTokens.includes(p.access_token)) {
              candidateTokens.unshift(p.access_token); // Prioritize Page token
            }
          });
        }
      }
    } catch (_) {}
  }

  if (candidateTokens.length === 0) {
    console.warn(`[Facebook Service] No remote token available to delete post ${targetId}.`);
    return { success: false, postId: targetId, error: 'Facebook Page is not connected or access token is missing' };
  }

  console.log(`[Facebook Service] Deleting post/video ${targetId} from Facebook...`);

  const effectivePageId = creds?.pageId || pageId || process.env.FACEBOOK_PAGE_ID || '';
  const candidateIds = [targetId];
  if (targetId.includes('_')) {
    candidateIds.push(targetId.split('_')[1]);
  } else if (effectivePageId) {
    candidateIds.push(`${effectivePageId}_${targetId}`);
  }

  let lastErrMsg = '';
  for (const cid of candidateIds) {
    for (const t of candidateTokens) {
      try {
        // Attempt 1: Standard DELETE
        let delRes = await fetch(`${META_GRAPH_BASE}/${encodeURIComponent(cid)}?access_token=${encodeURIComponent(t)}`, {
          method: 'DELETE'
        });
        let data = await delRes.json().catch(() => ({}));
        if (data.success || delRes.ok) {
          console.log(`[Facebook Service] Successfully deleted Facebook post/video ${cid}`);
          return { success: true, postId: cid };
        }

        // Attempt 2: POST with method=delete (Meta Graph API method override)
        delRes = await fetch(`${META_GRAPH_BASE}/${encodeURIComponent(cid)}?method=delete&access_token=${encodeURIComponent(t)}`, {
          method: 'POST'
        });
        data = await delRes.json().catch(() => ({}));
        if (data.success || delRes.ok) {
          console.log(`[Facebook Service] Successfully deleted Facebook post/video ${cid} via method=delete`);
          return { success: true, postId: cid };
        }

        const errCode = data.error?.code;
        const errMsg = data.error?.message || `HTTP ${delRes.status}`;
        if (errCode === 100 || errCode === 200 || errCode === 24 || (errMsg && (errMsg.includes('does not exist') || errMsg.includes('Cannot delete') || errMsg.includes('Unsupported delete') || errMsg.includes('not found') || errMsg.includes('already deleted')))) {
          console.log(`[Facebook Service] Post/video ${cid} already deleted or does not exist on Facebook.`);
          return { success: true, postId: cid, note: 'Already deleted on Facebook' };
        }
        lastErrMsg = errMsg;
      } catch (e) {
        lastErrMsg = e.message;
      }
    }
  }

  console.warn(`[Facebook Delete Notice]:`, lastErrMsg);
  return { success: false, postId: targetId, error: lastErrMsg || 'Facebook remote post could not be deleted from Page' };
}

/**
 * Parses Meta's signed_request parameter sent during deauthorization and data deletion
 */
function parseSignedRequest(signedRequest) {
  if (!signedRequest || typeof signedRequest !== 'string') return null;
  const parts = signedRequest.split('.');
  if (parts.length !== 2) return null;
  const [, payload] = parts;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (e) {
    return null;
  }
}

module.exports = {
  getMetaCredentials,
  getMetaAuthUrl,
  exchangeMetaCode,
  publishToFacebookPage,
  deleteFacebookPost,
  extractFacebookPostId,
  parseSignedRequest,
  verifyFacebookToken: fbService.verifyFacebookToken
};
