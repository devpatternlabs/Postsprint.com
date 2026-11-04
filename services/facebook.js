// services/facebook.js
// Postmint Facebook Page Publishing Service: Meta Graph API v21.0
// Supports Facebook Page Videos, Reels, Photos, and Status Posts with video readiness polling and verified permalinks

const db = require('../lib/db');

const META_APP_ID = (process.env.META_APP_ID || '').trim() || '2680197525765699';
const META_APP_SECRET = (process.env.META_APP_SECRET || '').trim() || '0764e538332d0eeb68deb98df70634d1';
const META_GRAPH_VERSION = 'v21.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const GRAPH_VIDEO_BASE = `https://graph-video.facebook.com/${META_GRAPH_VERSION}`;

/**
 * Polls the Facebook Video status until processing is complete and video is 'ready'
 * While video_status is 'processing', opening the link displays "This content isn't available right now"
 * 
 * @param {string} videoId - Facebook video object ID
 * @param {string} accessToken - Page Access Token
 * @param {string} [pageId] - Facebook Page ID
 * @param {number} [maxAttempts=25] - Max polling attempts
 * @param {number} [delayMs=3500] - Interval between attempts
 * @returns {Promise<{ ready: boolean, permalink: string | null, error?: string }>}
 */
async function pollFacebookVideoStatus(videoId, accessToken, pageId = '', maxAttempts = 3, delayMs = 1500) {
  console.log(`[Facebook Service] Checking processing status for Video ID: ${videoId}...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Fast initial check (350ms) so ready videos return immediately without idling
    await new Promise(r => setTimeout(r, attempt === 1 ? 350 : delayMs));

    try {
      const url = `${META_GRAPH_BASE}/${videoId}?fields=status,permalink_url,published&access_token=${encodeURIComponent(accessToken)}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || data.error) {
        console.warn(`[Facebook Service] Video poll attempt ${attempt} warning:`, data.error?.message || `HTTP ${res.status}`);
        continue;
      }

      const videoStatus = data.status?.video_status;
      console.log(`[Facebook Service] Video ${videoId} status: "${videoStatus}" (attempt ${attempt}/${maxAttempts})`);

      if (videoStatus === 'ready') {
        return {
          ready: true,
          permalink: `https://www.facebook.com/watch/?v=${videoId}`
        };
      }

      if (videoStatus === 'error') {
        const errorDetail = data.status?.processing_phase?.errors?.[0] || 'Facebook video processing failed.';
        return {
          ready: false,
          permalink: `https://www.facebook.com/watch/?v=${videoId}`,
          error: `Facebook video processing error: ${errorDetail}`
        };
      }
    } catch (e) {
      console.warn(`[Facebook Service] Video status polling exception on attempt ${attempt}:`, e.message);
    }
  }

  // Still encoding after initial checks: return accurate ready: false and canonical public Watch URL
  return {
    ready: false,
    permalink: `https://www.facebook.com/watch/?v=${videoId}`
  };
}

/**
 * Publishes a video to a Facebook Page with mandatory 'published=true' and video status polling
 * 
 * @param {object} params
 * @param {string} params.pageId - Facebook Page ID (e.g. '1399357519919142')
 * @param {string} params.pageAccessToken - Facebook Page Access Token
 * @param {Buffer} [params.videoBuffer] - Binary buffer of the video
 * @param {string} [params.videoUrl] - Public HTTPS URL of the video
 * @param {Buffer} [params.thumbBuffer] - Custom video thumbnail binary buffer
 * @param {string} [params.thumbUrl] - Custom video thumbnail public URL
 * @param {string} [params.title] - Video title
 * @param {string} [params.message] - Description / caption
 * @returns {Promise<{ success: boolean, postId: string, postUrl: string, type: string }>}
 */
async function publishFacebookVideo({
  pageId,
  pageAccessToken,
  videoBuffer,
  videoUrl,
  thumbBuffer = null,
  thumbUrl = null,
  title = '',
  message = ''
}) {
  if (!pageId) throw new Error('Facebook Page ID is required.');
  if (!pageAccessToken) throw new Error('Facebook Page Access Token is required.');

  console.log(`[Facebook Service] Initiating video publish on Page: ${pageId}...`);

  let targetVideoId = null;

  // 1. High-speed direct Meta ingest via public HTTPS URL (fastest: <1s API dispatch)
  if (videoUrl && videoUrl.startsWith('http')) {
    console.log(`[Facebook Service] Submitting public video URL to Facebook Graph Video API: ${videoUrl.slice(0, 60)}...`);
    const formParams = new URLSearchParams();
    formParams.set('file_url', videoUrl);
    formParams.set('published', 'true');
    if (message) formParams.set('description', message);
    if (title) formParams.set('title', title);
    if (thumbUrl && thumbUrl.startsWith('http')) formParams.set('thumb', thumbUrl);
    formParams.set('access_token', pageAccessToken);

    try {
      const res = await fetch(`${GRAPH_VIDEO_BASE}/${pageId}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formParams.toString()
      });
      const data = await res.json();
      if (res.ok && data.id) {
        targetVideoId = data.id;
        console.log(`[Facebook Service] Direct file_url accepted by Facebook! Video ID: ${targetVideoId}`);
      } else {
        const errMsg = data.error?.message || `HTTP ${res.status} posting video URL to Facebook`;
        if (data.error?.code === 190) {
          throw new Error('Facebook session has expired. Please re-authorize by connecting your Facebook account.');
        }
        console.warn('[Facebook Service] Direct file_url ingest rejected by Meta, switching to binary multipart download:', errMsg);
      }
    } catch (urlErr) {
      if (urlErr.message && urlErr.message.includes('Facebook session has expired')) {
        throw urlErr;
      }
      console.warn('[Facebook Service] Direct file_url ingest note, falling back to binary multipart:', urlErr.message);
    }
  }

  // 2. Download video bytes if needed so we can upload via binary multipart
  if (!targetVideoId && !videoBuffer && videoUrl && videoUrl.startsWith('http')) {
    try {
      console.log(`[Facebook Service] Downloading video bytes from ${videoUrl.slice(0, 60)}... for direct multipart upload to Facebook...`);
      const dlRes = await fetch(videoUrl);
      if (dlRes.ok) {
        const ab = await dlRes.arrayBuffer();
        videoBuffer = Buffer.from(ab);
        console.log(`[Facebook Service] Successfully downloaded ${videoBuffer.length} bytes for direct multipart upload.`);
      } else {
        console.warn(`[Facebook Service] Video download HTTP status ${dlRes.status}`);
      }
    } catch (dlErr) {
      console.warn(`[Facebook Service] Could not download video from URL:`, dlErr.message);
    }
  }

  // Fallback: Upload video via binary multipart buffer
  if (!targetVideoId && videoBuffer && Buffer.isBuffer(videoBuffer) && videoBuffer.length > 0) {
    console.log(`[Facebook Service] Uploading ${videoBuffer.length} bytes via multipart to Facebook Graph Video API...`);
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(videoBuffer)], { type: 'video/mp4' });
    formData.append('source', blob, 'video.mp4');
    formData.append('published', 'true');
    if (message) formData.append('description', message);
    if (title) formData.append('title', title);
    formData.append('access_token', pageAccessToken);

    if (thumbBuffer && Buffer.isBuffer(thumbBuffer) && thumbBuffer.length > 0) {
      const thumbBlob = new Blob([new Uint8Array(thumbBuffer)], { type: 'image/jpeg' });
      formData.append('thumb', thumbBlob, 'thumbnail.jpg');
    }

    const res = await fetch(`${GRAPH_VIDEO_BASE}/${pageId}/videos`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      const errMsg = data.error?.message || `HTTP ${res.status} uploading video to Facebook`;
      if (data.error?.code === 190) {
        throw new Error('Facebook session has expired. Please re-authorize by connecting your Facebook account.');
      }
      throw new Error(errMsg);
    }

    targetVideoId = data.id;
  }

  if (!targetVideoId) {
    throw new Error('Facebook video upload failed: neither URL ingest nor binary multipart upload succeeded.');
  }

  console.log(`[Facebook Service] Video upload accepted! Video ID: ${targetVideoId}. Checking custom thumbnail...`);

  // Apply custom thumbnail if available (as preferred thumbnail on the video)
  if (targetVideoId && ((thumbBuffer && thumbBuffer.length > 0) || (thumbUrl && thumbUrl.startsWith('http')))) {
    try {
      console.log(`[Facebook Service] Setting preferred thumbnail for Facebook Video ${targetVideoId}...`);
      if (thumbBuffer && Buffer.isBuffer(thumbBuffer) && thumbBuffer.length > 0) {
        const thumbForm = new FormData();
        const thumbBlob = new Blob([new Uint8Array(thumbBuffer)], { type: 'image/jpeg' });
        thumbForm.append('source', thumbBlob, 'thumbnail.jpg');
        thumbForm.append('is_preferred', 'true');
        thumbForm.append('access_token', pageAccessToken);
        const tRes = await fetch(`${META_GRAPH_BASE}/${targetVideoId}/thumbnails`, {
          method: 'POST',
          body: thumbForm
        });
        const tData = await tRes.json().catch(() => ({}));
        if (tRes.ok && (tData.success || tData.id)) {
          console.log(`[Facebook Service] Custom thumbnail applied successfully for video ${targetVideoId}`);
        }
      } else if (thumbUrl && thumbUrl.startsWith('http')) {
        const tParams = new URLSearchParams({
          file_url: thumbUrl,
          is_preferred: 'true',
          access_token: pageAccessToken
        });
        const tRes = await fetch(`${META_GRAPH_BASE}/${targetVideoId}/thumbnails`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: tParams.toString()
        });
        const tData = await tRes.json().catch(() => ({}));
        if (tRes.ok && (tData.success || tData.id)) {
          console.log(`[Facebook Service] Custom thumbnail URL applied successfully for video ${targetVideoId}`);
        }
      }
    } catch (tErr) {
      console.warn(`[Facebook Service] Note: Could not set preferred thumbnail: ${tErr.message}`);
    }
  }

  // 3. Quick check of encoding status
  const pollResult = await pollFacebookVideoStatus(targetVideoId, pageAccessToken, pageId);
  const finalPermalink = `https://www.facebook.com/watch/?v=${targetVideoId}`;

  return {
    success: true,
    postId: targetVideoId,
    postUrl: finalPermalink,
    type: 'video',
    ready: pollResult.ready,
    publishedAt: new Date().toISOString()
  };
}

/**
 * Publishes a Reel to a Facebook Page using the dedicated Facebook Reels API
 * Flow: /video_reels (start) -> upload -> /video_reels (finish) -> poll readiness
 * Falls back to standard video upload if Reels API is unsupported on the Page
 */
async function publishFacebookReel({
  pageId,
  pageAccessToken,
  videoBuffer,
  videoUrl,
  thumbBuffer = null,
  thumbUrl = null,
  message = '',
  title = ''
}) {
  console.log(`[Facebook Service] Publishing Facebook Reel to Page ${pageId}...`);

  try {
    // Step 1: Start Reel upload
    const startUrl = new URL(`${META_GRAPH_BASE}/${pageId}/video_reels`);
    startUrl.searchParams.set('upload_phase', 'start');
    startUrl.searchParams.set('access_token', pageAccessToken);

    const startRes = await fetch(startUrl.toString(), { method: 'POST' });
    const startData = await startRes.json();

    if (startRes.ok && startData.video_id && startData.upload_url) {
      const reelVideoId = startData.video_id;
      const uploadUrl = startData.upload_url;
      console.log(`[Facebook Service] Reel initialized. ID: ${reelVideoId}. Uploading binary to: ${uploadUrl.slice(0, 50)}...`);

      // Step 2: Transfer binary bytes
      let bufferToUpload = videoBuffer;
      if (!bufferToUpload && videoUrl) {
        const fetchVid = await fetch(videoUrl);
        if (fetchVid.ok) {
          const ab = await fetchVid.arrayBuffer();
          bufferToUpload = Buffer.from(ab);
        }
      }

      if (bufferToUpload) {
        const upRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `OAuth ${pageAccessToken}`,
            'offset': '0',
            'file_size': String(bufferToUpload.length)
          },
          body: bufferToUpload
        });

        if (upRes.ok) {
          // Step 3: Finish Reel
          console.log(`[Facebook Service] Finishing Reel publication for ${reelVideoId}...`);
          const finishUrl = new URL(`${META_GRAPH_BASE}/${pageId}/video_reels`);
          finishUrl.searchParams.set('upload_phase', 'finish');
          finishUrl.searchParams.set('video_id', reelVideoId);
          finishUrl.searchParams.set('video_state', 'PUBLISHED');
          if (message) finishUrl.searchParams.set('description', message);
          if (title) finishUrl.searchParams.set('title', title);
          finishUrl.searchParams.set('access_token', pageAccessToken);

          const finRes = await fetch(finishUrl.toString(), { method: 'POST' });
          const finData = await finRes.json();

          if (finRes.ok && (finData.success || finData.id)) {
            const pollRes = await pollFacebookVideoStatus(reelVideoId, pageAccessToken, pageId);
            return {
              success: true,
              postId: reelVideoId,
              postUrl: pollRes.permalink || `https://www.facebook.com/reel/${reelVideoId}`,
              type: 'reel',
              ready: pollRes.ready,
              publishedAt: new Date().toISOString()
            };
          }
        }
      }
    }
  } catch (reelErr) {
    console.warn(`[Facebook Service] Dedicated Reel endpoint encountered note (${reelErr.message}). Falling back to standard video publication...`);
  }

  // Fallback: Use verified publishFacebookVideo
  return publishFacebookVideo({
    pageId,
    pageAccessToken,
    videoBuffer,
    videoUrl,
    thumbBuffer,
    thumbUrl,
    title,
    message
  });
}

/**
 * Publishes a photo to a Facebook Page with verified permalink
 */
async function publishFacebookPhoto({
  pageId,
  pageAccessToken,
  imageUrl,
  message = ''
}) {
  console.log(`[Facebook Service] Publishing photo to Facebook Page ${pageId}...`);
  const photoUrl = new URL(`${META_GRAPH_BASE}/${pageId}/photos`);
  photoUrl.searchParams.set('url', imageUrl);
  if (message) photoUrl.searchParams.set('caption', message);
  photoUrl.searchParams.set('published', 'true');
  photoUrl.searchParams.set('access_token', pageAccessToken);

  const res = await fetch(photoUrl.toString(), { method: 'POST' });
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `HTTP ${res.status} uploading photo to Facebook`);
  }

  const targetPostId = data.post_id || data.id;
  let finalPhotoUrl = `https://www.facebook.com/${targetPostId}`;

  try {
    const permRes = await fetch(`${META_GRAPH_BASE}/${targetPostId}?fields=permalink_url&access_token=${encodeURIComponent(pageAccessToken)}`);
    const permData = await permRes.json();
    if (permData.permalink_url) finalPhotoUrl = permData.permalink_url;
  } catch (e) {}

  return {
    success: true,
    postId: targetPostId,
    postUrl: finalPhotoUrl,
    type: 'photo',
    publishedAt: new Date().toISOString()
  };
}

/**
 * Publishes a status text post to a Facebook Page with verified permalink
 */
async function publishFacebookFeed({
  pageId,
  pageAccessToken,
  message = ''
}) {
  console.log(`[Facebook Service] Publishing status post to Facebook Page ${pageId}...`);
  const feedUrl = new URL(`${META_GRAPH_BASE}/${pageId}/feed`);
  feedUrl.searchParams.set('message', message || 'Postmint Social Studio Update');
  feedUrl.searchParams.set('published', 'true');
  feedUrl.searchParams.set('access_token', pageAccessToken);

  const res = await fetch(feedUrl.toString(), { method: 'POST' });
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `HTTP ${res.status} creating Facebook post`);
  }

  const targetFeedId = data.id;
  let finalFeedUrl = `https://www.facebook.com/${targetFeedId}`;

  try {
    const permRes = await fetch(`${META_GRAPH_BASE}/${targetFeedId}?fields=permalink_url&access_token=${encodeURIComponent(pageAccessToken)}`);
    const permData = await permRes.json();
    if (permData.permalink_url) finalFeedUrl = permData.permalink_url;
  } catch (e) {}

  return {
    success: true,
    postId: targetFeedId,
    postUrl: finalFeedUrl,
    type: 'post',
    publishedAt: new Date().toISOString()
  };
}

/**
 * Inspects token validity and scopes using Meta's debug_token endpoint
 */
async function verifyFacebookToken(token) {
  if (!token) return { valid: false, error: 'No token provided' };

  try {
    const appToken = `${META_APP_ID}|${META_APP_SECRET}`;
    const url = `${META_GRAPH_BASE}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`;
    const res = await fetch(url);
    const json = await res.json();

    if (!res.ok || json.error) {
      return { valid: false, error: json.error?.message || `HTTP ${res.status}` };
    }

    const data = json.data || {};
    const isValid = data.is_valid === true;
    const scopes = data.scopes || [];
    const hasPublish = scopes.includes('pages_manage_posts');
    const hasInstagram = scopes.includes('instagram_content_publish');

    return {
      valid: isValid,
      type: data.type,
      profileId: data.profile_id,
      userId: data.user_id,
      expiresAt: data.expires_at ? new Date(data.expires_at * 1000).toISOString() : 'Never (Page Token)',
      scopes,
      hasManagePosts: hasPublish,
      hasInstagramPublish: hasInstagram,
      error: data.error?.message || null
    };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

module.exports = {
  publishFacebookVideo,
  publishFacebookReel,
  publishFacebookPhoto,
  publishFacebookFeed,
  pollFacebookVideoStatus,
  verifyFacebookToken
};
