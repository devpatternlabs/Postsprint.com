// services/instagram.js
// Postmint Instagram Professional Publishing Service: Meta Graph API v21.0
// Supports Instagram Reels, Stories, and Photos with end-to-end container polling and verified permalinks

const db = require('../lib/db');

const META_GRAPH_VERSION = 'v21.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/**
 * Polls the Instagram media container until video processing is FINISHED
 * Handles IN_PROGRESS, FINISHED, ERROR, and EXPIRED statuses
 * 
 * @param {string} containerId - Media container creation ID
 * @param {string} accessToken - Instagram/Facebook access token
 * @param {number} [maxAttempts=35] - Maximum number of polling attempts
 * @param {number} [delayMs=3500] - Interval between attempts
 * @returns {Promise<{ ready: boolean, error?: string }>}
 */
async function pollContainerStatus(containerId, accessToken, maxAttempts = 35, delayMs = 2500) {
  console.log(`[Instagram Service] Starting container polling for ID ${containerId} (max ${maxAttempts} attempts)...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Responsive polling schedule: check early (1s -> 1.5s -> 2s) so finished media publishes immediately
    const waitTime = attempt === 1 ? 1000 : attempt === 2 ? 1500 : attempt === 3 ? 2000 : delayMs;
    await new Promise(r => setTimeout(r, waitTime));

    try {
      const url = `${META_GRAPH_BASE}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || data.error) {
        const errMsg = data.error?.message || `HTTP ${res.status}`;
        console.warn(`[Instagram Service] Container poll attempt ${attempt} warning: ${errMsg}`);
        continue;
      }

      const statusCode = data.status_code;
      console.log(`[Instagram Service] Container ${containerId} status: ${statusCode} (attempt ${attempt}/${maxAttempts})`);

      if (statusCode === 'FINISHED') {
        return { ready: true };
      }

      if (statusCode === 'ERROR') {
        const detail = data.status || 'Instagram media processing encountered an error.';
        return {
          ready: false,
          error: `Instagram video processing failed: ${detail}`
        };
      }

      if (statusCode === 'EXPIRED') {
        return {
          ready: false,
          error: 'Instagram media container expired before publishing completed.'
        };
      }

      // IN_PROGRESS continues loop
    } catch (e) {
      console.warn(`[Instagram Service] Container poll network warning on attempt ${attempt}:`, e.message);
    }
  }

  return {
    ready: false,
    error: 'Timed out waiting for Instagram media transcoding to finish. The video may be too large or Meta is experiencing high latency.'
  };
}

/**
 * Retrieves the real verified Instagram web permalink with polling
 * CRITICAL: Never constructs a fake URL using the numeric Graph object ID
 * 
 * @param {string} mediaId - Published Instagram media ID
 * @param {string} accessToken - Graph API access token
 * @param {string} [username] - Account username for fallback profile link
 * @param {number} [maxAttempts=6] - Max poll attempts for permalink generation
 * @returns {Promise<{ permalink: string | null, verified: boolean }>}
 */
async function getInstagramPermalink(mediaId, accessToken, username = '', maxAttempts = 6) {
  console.log(`[Instagram Service] Fetching verified permalink for Media ID: ${mediaId}...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      await new Promise(r => setTimeout(r, 2000));
    }

    try {
      const url = `${META_GRAPH_BASE}/${mediaId}?fields=permalink,shortcode,media_type&access_token=${encodeURIComponent(accessToken)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();

        // 1. Official API permalink (highest priority)
        if (data.permalink && typeof data.permalink === 'string' && data.permalink.startsWith('https://')) {
          console.log(`[Instagram Service] Verified permalink resolved on attempt ${attempt}: ${data.permalink}`);
          return { permalink: data.permalink, verified: true };
        }

        // 2. Shortcode fallback (e.g. C8zK8a_Pq1L)
        if (data.shortcode && typeof data.shortcode === 'string') {
          const generatedUrl = (data.media_type === 'VIDEO')
            ? `https://www.instagram.com/reel/${data.shortcode}/`
            : `https://www.instagram.com/p/${data.shortcode}/`;
          console.log(`[Instagram Service] Constructed shortcode URL on attempt ${attempt}: ${generatedUrl}`);
          return { permalink: generatedUrl, verified: true };
        }
      }
    } catch (e) {
      console.warn(`[Instagram Service] Permalink query attempt ${attempt} warning:`, e.message);
    }
  }

  // If Meta API has not yet generated the permalink, do NOT create a broken numeric URL like /p/17983719481928471/
  console.warn(`[Instagram Service] Could not verify public permalink for ${mediaId}. Using profile link fallback.`);
  if (username) {
    const cleanUser = username.replace(/^@/, '');
    return {
      permalink: `https://www.instagram.com/${cleanUser}/`,
      verified: false
    };
  }

  return { permalink: null, verified: false };
}

/**
 * Creates an Instagram media container
 */
async function createInstagramContainer({
  instagramAccountId,
  accessToken,
  mediaUrl,
  caption = '',
  type = 'Post',
  isVideo = false,
  coverUrl = null,
  audioName = null
}) {
  const isStory = type === 'Story';
  const isReel = type === 'Reels' || (isVideo && !isStory);

  console.log(`[Instagram Service] Creating ${isReel ? 'REELS' : isStory ? 'STORY' : 'IMAGE'} container on IG Account: ${instagramAccountId}...`);

  const containerUrl = `${META_GRAPH_BASE}/${instagramAccountId}/media`;
  const bodyParams = new URLSearchParams();
  bodyParams.set('access_token', accessToken);

  if (isStory) {
    bodyParams.set('media_type', 'STORIES');
    if (isVideo) {
      bodyParams.set('video_url', mediaUrl);
    } else {
      bodyParams.set('image_url', mediaUrl);
    }
  } else if (isReel || isVideo) {
    bodyParams.set('media_type', 'REELS');
    bodyParams.set('video_url', mediaUrl);
    if (caption) bodyParams.set('caption', caption);
    bodyParams.set('share_to_feed', 'true');
    if (audioName && typeof audioName === 'string' && audioName.trim()) {
      const cleanAudio = audioName.trim().slice(0, 50);
      bodyParams.set('audio_name', cleanAudio);
      console.log(`[Instagram Service] Setting official audio_name: "${cleanAudio}"`);
    }
    if (coverUrl && coverUrl.startsWith('http')) {
      bodyParams.set('cover_url', coverUrl);
    }
  } else {
    // Standard photo feed post
    bodyParams.set('image_url', mediaUrl);
    if (caption) bodyParams.set('caption', caption);
  }

  const res = await fetch(containerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: bodyParams.toString()
  });
  const data = await res.json();

  if (!res.ok || !data.id) {
    const errMsg = data.error?.message || `HTTP ${res.status} creating Instagram container`;
    if (data.error?.code === 190) {
      throw new Error(`Instagram access token has expired or is invalid. Please reconnect your Meta account.`);
    }
    if (data.error?.error_user_msg) {
      throw new Error(`Instagram error: ${data.error.error_user_msg}`);
    }
    throw new Error(errMsg);
  }

  return {
    containerId: data.id,
    isReel,
    isStory,
    isVideo
  };
}

/**
 * Publishes an existing Instagram media container
 */
async function publishInstagramContainer({ instagramAccountId, containerId, accessToken }) {
  console.log(`[Instagram Service] Publishing container ${containerId} on IG Account: ${instagramAccountId}...`);

  const publishUrl = `${META_GRAPH_BASE}/${instagramAccountId}/media_publish`;
  const bodyParams = new URLSearchParams();
  bodyParams.set('creation_id', containerId);
  bodyParams.set('access_token', accessToken);

  let res = await fetch(publishUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: bodyParams.toString()
  });
  let data = await res.json();

  // Retry if container is still downloading/processing on Meta's CDN
  if (!res.ok && (data.error?.error_subcode === 2207027 || data.error?.code === 9007 || (data.error?.message && data.error.message.includes('not ready')))) {
    console.log('[Instagram Service] Media container still processing on Meta CDN. Waiting 3s to retry publish...');
    await new Promise(r => setTimeout(r, 3000));
    res = await fetch(publishUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString()
    });
    data = await res.json();
  }

  if (!res.ok || !data.id) {
    const errMsg = data.error?.message || `HTTP ${res.status} publishing Instagram container`;
    if (data.error?.error_user_msg) {
      throw new Error(`Instagram publish failed: ${data.error.error_user_msg}`);
    }
    throw new Error(errMsg);
  }

  return { publishedId: data.id };
}

/**
 * Publishes a Reel or Post to Instagram
 * End-to-end flow: validate -> create container -> poll status -> publish -> fetch verified permalink
 * 
 * @param {object} params
 * @param {string} params.mediaUrl - Accessible HTTPS URL (e.g. Supabase signed URL)
 * @param {string} [params.caption] - Caption text
 * @param {string} [params.type='Reels'] - 'Reels' | 'Story' | 'Post' | 'Video'
 * @param {string} [params.mimeType='video/mp4'] - MIME type
 * @param {string} [params.instagramAccountId] - Instagram Professional account ID
 * @param {string} [params.accessToken] - Meta Graph access token
 * @param {string} [params.username] - Instagram username
 * @returns {Promise<{ success: boolean, postId: string, postUrl: string, containerId: string, type: string, verified: boolean }>}
 */
async function publishInstagramReel({
  mediaUrl,
  caption = '',
  type = 'Reels',
  mimeType = 'video/mp4',
  instagramAccountId,
  accessToken,
  username = '',
  coverUrl = null,
  audioName = null
}) {
  if (!instagramAccountId || !accessToken) {
    throw new Error('Instagram Professional Account ID and Access Token are required. Please connect your Instagram Professional account.');
  }

  if (!mediaUrl || !mediaUrl.startsWith('http')) {
    throw new Error('Instagram publishing requires a publicly accessible HTTPS media URL.');
  }

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

  const isStory = type === 'Story';
  const isReel = isVideo && !isStory;

  // Step 1: Create Container
  const { containerId } = await createInstagramContainer({
    instagramAccountId,
    accessToken,
    mediaUrl,
    caption,
    type: isStory ? 'Story' : (isReel ? 'Reels' : (isVideo ? 'Reels' : 'Post')),
    isVideo,
    coverUrl,
    audioName
  });

  // Step 2: Poll Container Status (for videos/reels) or short wait for photos
  if (isVideo) {
    const statusResult = await pollContainerStatus(containerId, accessToken);
    if (!statusResult.ready) {
      throw new Error(statusResult.error || 'Instagram video container failed processing.');
    }
  } else {
    // For images, pause 1.5s so Meta CDN finishes crawling the image URL
    await new Promise(r => setTimeout(r, 1500));
  }

  // Step 3: Publish Container
  const { publishedId } = await publishInstagramContainer({
    instagramAccountId,
    containerId,
    accessToken
  });

  // Step 4: Resolve Verified Permalink
  const { permalink, verified } = await getInstagramPermalink(publishedId, accessToken, username);

  return {
    success: true,
    postId: publishedId,
    postUrl: permalink,
    containerId,
    type,
    verified,
    publishedAt: new Date().toISOString()
  };
}

/**
 * Direct delete helper for Instagram media objects
 */
async function deleteInstagramMedia(mediaId, accessToken) {
  if (!mediaId || !accessToken) return { success: false, error: 'Missing mediaId or accessToken' };
  try {
    const delUrl = `${META_GRAPH_BASE}/${encodeURIComponent(mediaId)}?access_token=${encodeURIComponent(accessToken)}`;
    const delRes = await fetch(delUrl, { method: 'DELETE' });
    const data = await delRes.json().catch(() => ({}));
    if (delRes.ok || data.success) {
      return { success: true, postId: mediaId };
    }
    return { success: false, error: data.error?.message || `HTTP ${delRes.status}` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = {
  createInstagramContainer,
  pollContainerStatus,
  publishInstagramContainer,
  getInstagramPermalink,
  publishInstagramReel,
  deleteInstagramMedia
};

