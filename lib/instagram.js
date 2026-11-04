// lib/instagram.js
// Postmint Instagram Professional Publishing Service: Meta Graph API v21.0
// Supports Instagram Reels, Stories, Videos, and Photos with status polling and verified permalinks

const db = require('./db');
const instagramService = require('../services/instagram');
const imageCalibrator = require('./image-calibrator');

const META_GRAPH_VERSION = 'v21.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/**
 * Resolves Instagram Business Account ID and Access Token
 */
async function resolveInstagramCredentials({ accountId, userId = 'usr_default_postmint', accessToken, instagramAccountId }) {
  if (accessToken) {
    return { 
      accessToken, 
      instagramAccountId: instagramAccountId || process.env.INSTAGRAM_ACCOUNT_ID || '', 
      username: '' 
    };
  }
  const accounts = await db.getConnectedAccounts(userId);
  
  // 1. If explicit accountId provided, check it
  if (accountId) {
    const directAcc = await db.getAccountWithTokens(accountId, userId);
    if (directAcc && directAcc.accessToken) {
      if (directAcc.platform === 'instagram' && directAcc.externalId) {
        return {
          instagramAccountId: directAcc.externalId,
          accessToken: directAcc.accessToken,
          username: directAcc.displayName?.replace(/^@/, '') || ''
        };
      } else if (directAcc.instagramAccountId || directAcc.instagram_account_id) {
        return {
          instagramAccountId: directAcc.instagramAccountId || directAcc.instagram_account_id,
          accessToken: directAcc.accessToken,
          username: directAcc.displayName?.replace(/^@/, '') || ''
        };
      }
    }
  }

  // 2. Check direct Instagram account
  let igAcc = accounts.find(a => a.platform === 'instagram' && a.status === 'active');
  if (igAcc) {
    const fullIg = await db.getAccountWithTokens(igAcc.id, userId);
    if (fullIg && fullIg.accessToken && fullIg.externalId) {
      return {
        instagramAccountId: fullIg.externalId,
        accessToken: fullIg.accessToken,
        username: fullIg.displayName?.replace(/^@/, '') || ''
      };
    }
  }

  // 3. Check Facebook / Meta Page with connected Instagram business account
  let fbAcc = accounts.find(a => (a.platform === 'facebook' || a.platform === 'meta') && a.status === 'active');
  if (fbAcc) {
    const fullFb = await db.getAccountWithTokens(fbAcc.id, userId);
    if (fullFb && fullFb.accessToken) {
      if (fullFb.instagramAccountId || fullFb.instagram_account_id) {
        return {
          instagramAccountId: fullFb.instagramAccountId || fullFb.instagram_account_id,
          accessToken: fullFb.accessToken,
          username: fullFb.displayName?.replace(/^@/, '') || ''
        };
      }
      try {
        const pageTarget = fullFb.pageId || (fullFb.externalId !== '122113587423476695' ? fullFb.externalId : (process.env.FACEBOOK_PAGE_ID || '1399357519919142'));
        const queryUrl = `${META_GRAPH_BASE}/${pageTarget}?fields=instagram_business_account{id,username,name}&access_token=${encodeURIComponent(fullFb.accessToken)}`;
        const res = await fetch(queryUrl);
        const data = await res.json();
        if (data.instagram_business_account?.id) {
          return {
            instagramAccountId: data.instagram_business_account.id,
            accessToken: fullFb.accessToken,
            username: data.instagram_business_account.username || ''
          };
        }
      } catch (e) {
        console.warn('[Instagram] Failed to query linked IG account:', e.message);
      }
    }
  }

  // 4. Fallback: check environment variables (if INSTAGRAM_ACCOUNT_ID is explicitly configured)
  const envToken = process.env.INSTAGRAM_ACCESS_TOKEN || 
                   process.env.FACEBOOK_PAGE_ACCESS_TOKEN || 
                   process.env.META_PAGE_ACCESS_TOKEN;
  const envIgId = process.env.INSTAGRAM_ACCOUNT_ID || instagramAccountId;
  if (envToken && envIgId && envIgId !== process.env.FACEBOOK_PAGE_ID && envIgId !== '122113587423476695' && envIgId !== '1399357519919142') {
    return {
      instagramAccountId: envIgId,
      accessToken: envToken,
      username: ''
    };
  }

  return null;
}

/**
 * Publishes media to Instagram (Reel, Story, Video, or Photo)
 * Uses services/instagram.js for full container lifecycle and verified permalink polling
 */
async function publishToInstagram({
  mediaUrl,
  caption = '',
  type = 'Post',
  mimeType,
  accountId,
  instagramAccountId: directIgId,
  accessToken: directToken,
  userId = 'usr_default_postmint',
  coverUrl = null,
  audioName = null,
  audioTrack = null
}) {
  const cleanUrl = (mediaUrl || '').split('?')[0].toLowerCase();

  // 1. Video detection: Video indicators ALWAYS take absolute priority over "Post" type
  const isVideoExt = /\.(mp4|mov|webm|mkv|avi|m4v|3gp|flv|wmv)$/i.test(cleanUrl);
  const isVideoMime = Boolean(mimeType && mimeType.startsWith('video/'));
  const isVideoType = type === 'Video' || type === 'Reels';
  const isVideo = isVideoMime || isVideoExt || isVideoType;

  // 2. Image detection: strictly when media is not a video
  const isImageExt = /\.(jpg|jpeg|png|webp|gif|bmp|heic|avif)$/i.test(cleanUrl);
  const isImageMime = Boolean(mimeType && mimeType.startsWith('image/'));
  const isImage = !isVideo && (isImageMime || isImageExt || type === 'Post');

  // 3. Instagram presentation format
  const isStory = type === 'Story';
  const isReel = isVideo && !isStory; // In Meta Graph API, all feed videos are published as Reels

  console.log(`[Instagram] Preparing to publish ${isImage ? (isStory ? 'STORY PHOTO' : 'FEED PHOTO') : (isStory ? 'STORY VIDEO' : 'REEL')} (isVideo=${isVideo}, isReel=${isReel})...`);

  let creds = null;
  if (directIgId && directToken) {
    creds = { instagramAccountId: directIgId, accessToken: directToken };
  } else {
    creds = await resolveInstagramCredentials({ accountId, userId });
  }

  if (!creds || !creds.instagramAccountId || !creds.accessToken) {
    throw new Error('Instagram Professional account is not connected. Please connect your Instagram Professional account in Connected Accounts.');
  }

  if (!mediaUrl || !mediaUrl.startsWith('http')) {
    throw new Error('Instagram publishing requires a public HTTPS media URL. Please upload your media first.');
  }

  // 4. Ensure image is calibrated for Meta (valid JPEG format and compliant aspect ratio [0.80, 1.91])
  let resolvedMediaUrl = mediaUrl;
  let resolvedMime = isImage ? 'image/jpeg' : (mimeType || 'video/mp4');

  if (isImage) {
    try {
      console.log(`[Instagram] Calibrating image to guarantee valid JPEG format and Meta aspect ratio constraints...`);
      const cal = await imageCalibrator.calibrateImageForMeta({
        mediaUrl,
        type: isStory ? 'Story' : 'Post'
      });
      if (cal && cal.mediaUrl) {
        resolvedMediaUrl = cal.mediaUrl;
        resolvedMime = cal.mimeType || 'image/jpeg';
      }
    } catch (calErr) {
      console.warn('[Instagram Warning] Image calibration fallback:', calErr.message);
    }
  }

  // Resolve official audio name if provided
  const resolvedAudioName = audioName || (audioTrack?.title ? (audioTrack.artist ? `${audioTrack.title} · ${audioTrack.artist}` : audioTrack.title) : null);

  // Call official publishing service with container polling and verified permalink resolution
  try {
    const result = await instagramService.publishInstagramReel({
      mediaUrl: resolvedMediaUrl,
      caption,
      type: isImage ? (isStory ? 'Story' : 'Post') : (isStory ? 'Story' : 'Reels'),
      mimeType: resolvedMime,
      instagramAccountId: creds.instagramAccountId,
      accessToken: creds.accessToken,
      username: creds.username || '',
      coverUrl: isImage ? null : coverUrl,
      audioName: resolvedAudioName
    });

    return {
      success: true,
      postId: result.postId,
      postUrl: result.postUrl,
      containerId: result.containerId,
      type: result.type,
      verified: result.verified
    };
  } catch (err) {
    console.error('[Instagram API Error]:', err.message);
    if (err.message && (err.message.includes('Session has expired') || err.message.includes('code 190') || err.message.includes('Error validating access token'))) {
      throw new Error('Instagram access token has expired. Please re-authorize by connecting your Facebook/Instagram account.');
    }
    throw err;
  }
}

/**
 * Helper to extract Instagram media ID or shortcode from string or URL
 */
function extractInstagramMediaId(input) {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();
  if (/^\d+$/.test(str)) return str;
  const match = str.match(/(?:instagram\.com\/(?:p|reel|tv)\/([a-zA-Z0-9_-]+))/i);
  if (match) return match[1];
  return str;
}

/**
 * Deletes media from Instagram Professional account by mediaId or URL
 */
async function deleteInstagramMedia({ mediaId, url = null, userId = 'usr_default_postmint', accountId, accessToken, instagramAccountId }) {
  const urlId = extractInstagramMediaId(url);
  const rawTarget = extractInstagramMediaId(mediaId);
  const rawId = (rawTarget && !rawTarget.startsWith('p_')) ? rawTarget : (urlId || rawTarget || mediaId);

  if (!rawId || (typeof rawId === 'string' && rawId.startsWith('p_'))) {
    console.warn(`[Instagram Delete] Invalid or unresolvable Instagram media ID: ${rawId}`);
    return { success: false, postId: rawId, error: 'Instagram media ID not found. Post cannot be deleted remotely.' };
  }

  const strId = String(extractInstagramMediaId(rawId) || rawId).trim();

  // If this is a mock ID, demo ID, or local draft ID (e.g. 'sim_', 'p_')
  if (process.env.SOCIAL_API_MOCK_MODE === 'true' || 
      strId.startsWith('sim_') || 
      strId.startsWith('demo_')) {
    console.log(`[Instagram Service] Identified simulated ID (${strId}). Marking deleted.`);
    return { success: true, postId: strId, mock: true };
  }

  const creds = await resolveInstagramCredentials({ accountId, userId, accessToken, instagramAccountId });
  const primaryToken = accessToken || creds?.accessToken;

  // Candidate tokens to try in order
  const candidateTokens = [];
  [
    primaryToken,
    creds?.accessToken,
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
    process.env.META_PAGE_ACCESS_TOKEN,
    process.env.INSTAGRAM_ACCESS_TOKEN,
    process.env.FACEBOOK_USER_ACCESS_TOKEN
  ].forEach(t => {
    if (t && typeof t === 'string' && !candidateTokens.includes(t)) {
      candidateTokens.push(t);
    }
  });

  // Fallback: search system-wide for any active Instagram/Meta account in Supabase
  if (candidateTokens.length === 0) {
    try {
      const { supabaseFetch } = require('./db');
      const allRes = await supabaseFetch('social_accounts?provider=in.(instagram,facebook,meta)&order=updated_at.desc&limit=10');
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

  // Attempt to upgrade any User Access Token to Page Access Token via /me/accounts
  for (const t of [...candidateTokens]) {
    try {
      const pagesRes = await fetch(`${META_GRAPH_BASE}/me/accounts?fields=access_token,instagram_business_account&access_token=${encodeURIComponent(t)}`);
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
    console.warn(`[Instagram Service] No remote token available to delete media ${strId}.`);
    return { success: false, postId: strId, error: 'Instagram Professional account is not connected or access token is missing' };
  }

  // If strId is non-numeric (e.g. shortcode 'DdlOvfoFZW0' from URL), resolve numeric media ID
  let numericMediaId = /^\d+$/.test(strId) ? strId : null;
  const effectiveIgAccountId = creds?.instagramAccountId || instagramAccountId || process.env.INSTAGRAM_ACCOUNT_ID;

  if (!numericMediaId && effectiveIgAccountId) {
    for (const t of candidateTokens) {
      try {
        const mRes = await fetch(`${META_GRAPH_BASE}/${encodeURIComponent(effectiveIgAccountId)}/media?fields=id,shortcode,permalink&limit=50&access_token=${encodeURIComponent(t)}`);
        if (mRes.ok) {
          const mData = await mRes.json();
          if (Array.isArray(mData?.data)) {
            const match = mData.data.find(m => m.shortcode === strId || (m.permalink && m.permalink.includes(strId)));
            if (match && match.id) {
              numericMediaId = match.id;
              break;
            }
          }
        }
      } catch (_) {}
    }
  }

  const targetMediaId = numericMediaId || strId;
  console.log(`[Instagram Service] Deleting media ${targetMediaId} from Instagram via Meta Graph API...`);
  let lastErrMsg = '';

  for (const t of candidateTokens) {
    try {
      // Attempt 1: Standard DELETE
      let delUrl = `${META_GRAPH_BASE}/${encodeURIComponent(targetMediaId)}?access_token=${encodeURIComponent(t)}`;
      let delRes = await fetch(delUrl, { method: 'DELETE' });
      let data = await delRes.json().catch(() => ({}));

      if (delRes.ok || data.success === true) {
        console.log(`[Instagram Service] Successfully deleted media ${targetMediaId} from Instagram.`);
        return { success: true, postId: targetMediaId };
      }

      // Attempt 2: POST with method=delete
      delUrl = `${META_GRAPH_BASE}/${encodeURIComponent(targetMediaId)}?method=delete&access_token=${encodeURIComponent(t)}`;
      delRes = await fetch(delUrl, { method: 'POST' });
      data = await delRes.json().catch(() => ({}));

      if (delRes.ok || data.success === true) {
        console.log(`[Instagram Service] Successfully deleted media ${targetMediaId} via method=delete.`);
        return { success: true, postId: targetMediaId };
      }

      const errCode = data.error?.code;
      const errMsg = data.error?.message || `HTTP ${delRes.status}`;
      console.warn(`[Instagram Service] Delete attempt on ${targetMediaId} returned: ${errMsg} (code: ${errCode})`);

      // If object does not exist or was already deleted on Instagram
      if (errCode === 100 || errCode === 24 || errCode === 33 || (errMsg && (errMsg.includes('does not exist') || errMsg.includes('Cannot delete') || errMsg.includes('already deleted') || errMsg.includes('not found')))) {
        console.log(`[Instagram Service] Media ${targetMediaId} already deleted on Instagram. Marking completed.`);
        return { success: true, postId: targetMediaId, note: 'Media already deleted on Instagram' };
      }

      lastErrMsg = errMsg;
    } catch (e) {
      lastErrMsg = e.message;
    }
  }

  console.warn(`[Instagram Delete Notice]:`, lastErrMsg);
  return { success: false, postId: targetMediaId, error: lastErrMsg || 'Instagram media could not be deleted from account' };
}

module.exports = {
  resolveInstagramCredentials,
  publishToInstagram,
  deleteInstagramMedia,
  extractInstagramMediaId,
  pollInstagramContainer: instagramService.pollContainerStatus,
  getInstagramPermalink: instagramService.getInstagramPermalink
};
