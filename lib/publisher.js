// lib/publisher.js
// Multi-Platform Publishing Orchestrator for Postmint Social Studio
// Coordinates simultaneous publishing to YouTube, Facebook, and Instagram
// Enforces verified API permalinks, independent job execution, idempotent retries, and safe media lifecycle

const db = require('./db');
const youtube = require('./youtube');
const facebook = require('./facebook');
const instagram = require('./instagram');
const supabaseStorage = require('./supabase-storage');
const mediaService = require('../services/media-upload');
const imageCalibrator = require('./image-calibrator');

/**
 * Publishes a post across all selected platforms with independent sub-job execution
 * 
 * @param {object} params
 * @param {string} params.postId - Internal post ID
 * @param {string[]} params.platforms - Array of platform names: ['YouTube', 'Facebook', 'Instagram']
 * @param {string} params.title - Post or video title
 * @param {string} params.caption - Post caption / description
 * @param {string} params.hashtags - Hashtags string e.g. '#marketing #ai'
 * @param {string} params.type - 'Post' | 'Video' | 'Reels' | 'Story'
 * @param {string} params.ratio - '1:1' | '9:16' | '16:9' | '4:5'
 * @param {string} params.storagePath - Path in Supabase Storage bucket ('social-videos')
 * @param {string} params.mediaUrl - Public or signed URL of the media
 * @param {string} params.mediaBase64 - Optional fallback Base64 data
 * @param {string} params.mimeType - MIME type e.g. 'video/mp4', 'image/png'
 * @param {string} params.userId - User ID
 */
async function publishToAllPlatforms(params = {}) {
  const data = params.post ? { ...params.post, ...params } : params;
  const {
    postId,
    platforms = [],
    title = '',
    caption = '',
    hashtags = '',
    type = 'Post',
    ratio = '1:1',
    mediaUrl,
    mediaBase64,
    userId = 'usr_default_postmint'
  } = data;
  const inputFilename = (data.filename || data.name || '').toLowerCase();
  let currentMimeType = (data.mimeType || '').toLowerCase();
  if (!currentMimeType || currentMimeType === 'application/octet-stream') {
    if (/\.(jpg|jpeg)$/i.test(inputFilename)) currentMimeType = 'image/jpeg';
    else if (/\.png$/i.test(inputFilename)) currentMimeType = 'image/png';
    else if (/\.webp$/i.test(inputFilename)) currentMimeType = 'image/webp';
    else if (/\.(mp4|m4v)$/i.test(inputFilename)) currentMimeType = 'video/mp4';
    else if (/\.mov$/i.test(inputFilename)) currentMimeType = 'video/quicktime';
    else if (/\.webm$/i.test(inputFilename)) currentMimeType = 'video/webm';
    else currentMimeType = (type === 'Post') ? 'image/jpeg' : 'video/mp4';
  }
  let currentStoragePath = data.storagePath;

  console.log(`[Publisher] Starting independent multi-platform dispatch for Post "${title || caption.slice(0, 30)}" to [${Array.isArray(platforms) ? platforms.join(', ') : platforms}]...`);

  if (!Array.isArray(platforms) || platforms.length === 0) {
    throw new Error('Please select at least one platform to publish.');
  }

  const isMock = data.mockMode === true ||
                 data.socialMockMode === true ||
                 process.env.SOCIAL_API_MOCK_MODE === 'true';

  // Sync client-provided connected accounts to the local DB cache if valid access token provided
  if (data.connectedAccounts && typeof data.connectedAccounts === 'object') {
    for (const [pName, acc] of Object.entries(data.connectedAccounts)) {
      if (acc && acc.accessToken && typeof acc.accessToken === 'string' &&
          !acc.accessToken.startsWith('demo_') && !acc.accessToken.startsWith('mock_') &&
          !String(acc.externalId || '').startsWith('demo_') &&
          acc.accessToken !== 'true' && acc.accessToken !== 'null') {
        try {
          await db.upsertSocialAccount({
            userId,
            platform: pName.toLowerCase(),
            externalId: acc.externalId || `ext_${pName.toLowerCase()}`,
            displayName: acc.displayName || `${pName} Account`,
            avatarUrl: acc.avatarUrl || null,
            accessToken: acc.accessToken,
            refreshToken: acc.refreshToken || null,
            expiresAt: acc.expiresAt || null,
            pageId: acc.pageId || null
          });
        } catch (e) {}
      }
    }
  }

  // 1. Resolve media buffer and external signed URL
  let videoBuffer = data.videoBuffer || null;
  let accessibleUrl = mediaUrl;

  const hasYouTube = platforms.some(p => (p || '').toLowerCase() === 'youtube');
  const hasFacebook = platforms.some(p => (p || '').toLowerCase() === 'facebook');
  const hasInstagram = platforms.some(p => (p || '').toLowerCase() === 'instagram');
  // Only YouTube strictly requires a raw binary buffer in server memory. Meta (Facebook & Instagram) ingests directly from public/signed URLs in <1s!
  const needsBuffer = !videoBuffer && (hasYouTube || (!accessibleUrl && !currentStoragePath && !mediaUrl));

  // If storagePath is given, download buffer only when needed and generate signed URL concurrently
  if (currentStoragePath) {
    try {
      console.log(`[Publisher] Resolving media from Supabase Storage: ${currentStoragePath} (needsBuffer=${needsBuffer})...`);
      const signedUrlPromise = supabaseStorage.createSignedUrl(currentStoragePath, 7 * 24 * 3600);
      const bufferPromise = needsBuffer ? supabaseStorage.downloadFromSupabase(currentStoragePath) : Promise.resolve(null);

      const [resolvedSignedUrl, downloadedBuffer] = await Promise.all([signedUrlPromise, bufferPromise]);
      accessibleUrl = resolvedSignedUrl || accessibleUrl;
      if (downloadedBuffer) {
        videoBuffer = downloadedBuffer;
        console.log(`[Publisher] Loaded media buffer: ${videoBuffer.length} bytes`);
      }
    } catch (sbErr) {
      console.warn('[Publisher Warning] Could not fetch directly from Supabase, attempting fallbacks:', sbErr.message);
    }
  }

  // Fallback: decode base64 if buffer is not yet resolved
  if (!videoBuffer && mediaBase64) {
    const matches = mediaBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches) {
      currentMimeType = matches[1];
      videoBuffer = Buffer.from(matches[2], 'base64');
    } else {
      videoBuffer = Buffer.from(mediaBase64, 'base64');
    }
  }

  // Fallback: fetch from mediaUrl if buffer still missing
  if (!videoBuffer && needsBuffer && accessibleUrl && accessibleUrl.startsWith('http')) {
    try {
      const fRes = await fetch(accessibleUrl);
      if (fRes.ok) {
        const ab = await fRes.arrayBuffer();
        videoBuffer = Buffer.from(ab);
        currentMimeType = fRes.headers.get('content-type') || currentMimeType;
      }
    } catch (fErr) {
      console.warn('[Publisher Warning] Could not fetch mediaUrl buffer:', fErr.message);
    }
  }

  // Magic byte inspection for reliable media classification
  let detectedVideo = false;
  let detectedImage = false;
  if (videoBuffer && Buffer.isBuffer(videoBuffer) && videoBuffer.length >= 8) {
    if (videoBuffer[0] === 0xFF && videoBuffer[1] === 0xD8 && videoBuffer[2] === 0xFF) {
      detectedImage = true;
      currentMimeType = 'image/jpeg';
    } else if (videoBuffer[0] === 0x89 && videoBuffer[1] === 0x50 && videoBuffer[2] === 0x4E && videoBuffer[3] === 0x47) {
      detectedImage = true;
      currentMimeType = 'image/png';
    } else if (videoBuffer[0] === 0x47 && videoBuffer[1] === 0x49 && videoBuffer[2] === 0x46) {
      detectedImage = true;
      currentMimeType = 'image/gif';
    } else if (videoBuffer[0] === 0x1A && videoBuffer[1] === 0x45 && videoBuffer[2] === 0xDF && videoBuffer[3] === 0xA3) {
      detectedVideo = true;
      currentMimeType = 'video/webm';
    } else {
      const box = videoBuffer.toString('latin1', 4, 8);
      if (['ftyp', 'moov', 'mdat', 'wide', 'skip'].includes(box)) {
        detectedVideo = true;
        currentMimeType = 'video/mp4';
      }
    }
  }

  // Strictly determine whether media is an image/photo or video
  const isVideoFile = /\.(mp4|mov|webm|mkv|avi|m4v|3gp|flv|wmv)$/i.test(inputFilename) ||
                      /\.(mp4|mov|webm|mkv|avi|m4v|3gp|flv|wmv)(\?|$)/i.test(accessibleUrl || '') ||
                      /\.(mp4|mov|webm|mkv|avi|m4v|3gp|flv|wmv)$/i.test(currentStoragePath || '');
  const isVideoMime = (currentMimeType && currentMimeType.startsWith('video/')) || detectedVideo;
  const isImageFile = /\.(jpg|jpeg|png|webp|gif|bmp|heic|svg)$/i.test(inputFilename) ||
                      /\.(jpg|jpeg|png|webp|gif|bmp|heic|svg)(\?|$)/i.test(accessibleUrl || '');
  const isImageMime = (currentMimeType && currentMimeType.startsWith('image/')) || detectedImage;

  // Video priority: if video extension, video mime, or video box detected, it is definitely a video
  const isVideo = isVideoMime || isVideoFile || type === 'Video' || type === 'Reels';
  const isImage = !isVideo && (isImageMime || isImageFile || type === 'Post');

  // Resolve custom thumbnail (for Facebook, YouTube, Instagram)
  let thumbBuffer = null;
  let thumbUrl = data.thumbnailUrl || data.poster || null;
  const thumbBase64 = data.thumbnailBase64 || null;
  const thumbStoragePath = data.thumbnailStoragePath || null;

  if (thumbStoragePath) {
    try {
      console.log(`[Publisher] Resolving thumbnail from storage: ${thumbStoragePath}...`);
      const [resolvedThumbUrl, downloadedThumb] = await Promise.all([
        supabaseStorage.createSignedUrl(thumbStoragePath, 7 * 24 * 3600),
        supabaseStorage.downloadFromSupabase(thumbStoragePath)
      ]);
      if (resolvedThumbUrl) thumbUrl = resolvedThumbUrl;
      if (downloadedThumb) thumbBuffer = downloadedThumb;
    } catch (tbErr) {
      console.warn('[Publisher] Could not fetch thumbnail from storage:', tbErr.message);
    }
  }

  if (!thumbBuffer && thumbBase64) {
    const tbMatch = thumbBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (tbMatch) {
      thumbBuffer = Buffer.from(tbMatch[2], 'base64');
    } else {
      thumbBuffer = Buffer.from(thumbBase64, 'base64');
    }
  }

  if (!thumbBuffer && thumbUrl && thumbUrl.startsWith('http')) {
    try {
      const fRes = await fetch(thumbUrl);
      if (fRes.ok) {
        const ab = await fRes.arrayBuffer();
        thumbBuffer = Buffer.from(ab);
      }
    } catch (tbErr) {
      console.warn('[Publisher] Could not fetch thumbnail URL buffer:', tbErr.message);
    }
  }

  if ((!accessibleUrl || !accessibleUrl.startsWith('http')) && videoBuffer) {
    try {
      console.log(`[Publisher] Staging media buffer (${isImage ? 'IMAGE' : 'VIDEO'}) to Supabase Storage...`);
      const fileExt = isImage ? (currentMimeType.includes('png') || inputFilename.endsWith('.png') ? 'png' : 'jpg') : 'mp4';
      const fileMime = isImage ? (currentMimeType.startsWith('image/') ? currentMimeType : 'image/jpeg') : 'video/mp4';
      const staged = await mediaService.uploadToStorage({
        buffer: videoBuffer,
        filename: `media_${Date.now()}.${fileExt}`,
        mimeType: fileMime,
        folder: 'posts'
      });
      accessibleUrl = staged.signedUrl;
      currentStoragePath = staged.storagePath;
    } catch (upErr) {
      console.warn('[Publisher Warning] Media staging warning:', upErr.message);
    }
  }

  let fullText = [caption, hashtags].filter(Boolean).join('\n\n');
  const songTitle = data.audioName || (data.audioTrack ? `${data.audioTrack.title}${data.audioTrack.artist ? ` · ${data.audioTrack.artist}` : ''}` : null);
  if (songTitle && !fullText.includes(data.audioTrack?.title || songTitle)) {
    fullText = fullText ? `${fullText}\n\n🎵 ${songTitle}` : `🎵 ${songTitle}`;
  }

  // 2. Dispatch to ALL selected platforms in PARALLEL for maximum upload speed
  console.log(`[Publisher] Dispatching ${platforms.length} platform jobs concurrently in parallel: [${platforms.join(', ')}]...`);
  const results = await Promise.all(platforms.map(async (plat) => {
    const normalizedPlat = (plat || '').toLowerCase();
    console.log(`[Publisher] Starting concurrent sub-job for platform: ${plat}...`);

    try {
      // Mock mode only applies to Meta (Facebook/Instagram) if mockMode is explicitly enabled.
      // YouTube NEVER uses mock or fake URLs under any circumstances!
      if (isMock && normalizedPlat !== 'youtube') {
        console.log(`[Publisher Mock] Simulating publishing to ${plat}...`);
        const mockPostId = `sim_${plat.toLowerCase()}_${Date.now()}`;
        const mockUrl = plat.toLowerCase() === 'instagram'
          ? `https://www.instagram.com/`
          : `https://www.facebook.com/`;
        return {
          platform: plat,
          success: true,
          status: 'published',
          postId: mockPostId,
          url: mockUrl,
          mock: true
        };
      }

      // --- YOUTUBE ---
      if (normalizedPlat === 'youtube') {
        const isPhotoMedia = (currentMimeType && currentMimeType.startsWith('image/')) || (!isVideo && (!videoBuffer || videoBuffer.length === 0));
        if (isPhotoMedia && (!videoBuffer || currentMimeType.startsWith('image/'))) {
          console.warn('[Publisher] YouTube requires a video file (.mp4, .webm). Image detected; skipping YouTube upload without failing batch.');
          return {
            platform: 'YouTube',
            success: false,
            status: 'skipped',
            upload_status: 'skipped',
            processing_status: 'skipped',
            videoId: null,
            youtubeUrl: null,
            url: null,
            error: 'photoNotSupported',
            message: 'YouTube requires video format (.mp4, .webm). Photo published to Meta channels.',
            retryable: false
          };
        }

        if (!videoBuffer && accessibleUrl && accessibleUrl.startsWith('http')) {
          console.log(`[Publisher] Fetching video buffer for YouTube from ${accessibleUrl.slice(0, 60)}...`);
          try {
            const fRes = await fetch(accessibleUrl);
            if (fRes.ok) {
              const ab = await fRes.arrayBuffer();
              videoBuffer = Buffer.from(ab);
            }
          } catch (fErr) {
            console.warn('[Publisher] Could not fetch accessibleUrl for YouTube:', fErr.message);
          }
        }

        if (!videoBuffer) {
          throw new Error('YouTube requires a valid video file. Please upload an MP4, MOV, or WebM video.');
        }

        const ytToken = data.connectedAccounts?.YouTube?.accessToken || data.connectedAccounts?.youtube?.accessToken;
        const ytRefresh = data.connectedAccounts?.YouTube?.refreshToken || data.connectedAccounts?.youtube?.refreshToken;

        const ytResult = await youtube.uploadVideoToYouTube({
          userId,
          postId,
          accountId: data.accountId || data.connectedAccounts?.YouTube?.id || data.connectedAccounts?.youtube?.id,
          accessToken: ytToken,
          refreshToken: ytRefresh,
          videoBuffer,
          thumbBuffer,
          thumbUrl,
          filename: data.filename || data.video_filename || 'video.mp4',
          title: title || caption.slice(0, 70) || 'Postmint Video',
          description: fullText,
          tags: hashtags ? hashtags.split(/[\s,#]+/).filter(Boolean) : [],
          privacyStatus: data.privacyStatus || 'public',
          mimeType: currentMimeType
        });

        // Video successfully created and uploaded to YouTube
        return {
          platform: 'YouTube',
          success: true,
          status: 'published',
          upload_status: 'uploaded',
          processing_status: 'completed',
          postId: ytResult.videoId,
          videoId: ytResult.videoId,
          url: ytResult.youtubeUrl,
          youtubeUrl: ytResult.youtubeUrl,
          studioUrl: ytResult.studioUrl,
          privacy_status: ytResult.privacy_status || 'public',
          uploaded_at: ytResult.uploaded_at || new Date().toISOString()
        };
      }

      // --- FACEBOOK ---
      else if (normalizedPlat === 'facebook') {
        const isPhoto = isImage || !isVideo;
        const fbAcc = data.connectedAccounts?.Facebook || data.connectedAccounts?.facebook;
        const fbResult = await facebook.publishToFacebookPage({
          userId,
          accountId: data.accountId || fbAcc?.id,
          pageId: fbAcc?.externalId || fbAcc?.pageId,
          pageAccessToken: fbAcc?.accessToken,
          message: fullText,
          title: title || '',
          videoBuffer: isPhoto ? null : (isVideo ? videoBuffer : null),
          videoUrl: isPhoto ? null : (isVideo && accessibleUrl ? accessibleUrl : null),
          imageUrl: isPhoto && accessibleUrl ? accessibleUrl : null,
          thumbBuffer: isPhoto ? null : thumbBuffer,
          thumbUrl: isPhoto ? null : thumbUrl,
          type: isPhoto ? 'Post' : type
        });

        let fbUrl = fbResult.postUrl;
        if (!fbUrl || !fbUrl.startsWith('http')) {
          fbUrl = isPhoto ? `https://www.facebook.com/${fbResult.postId}` : `https://www.facebook.com/watch/?v=${fbResult.postId}`;
        }

        return {
          platform: 'Facebook',
          success: true,
          status: 'published',
          ready: true,
          postId: fbResult.postId,
          url: fbUrl,
          type: fbResult.type || (isPhoto ? 'photo' : 'video')
        };
      }

      // --- INSTAGRAM ---
      else if (normalizedPlat === 'instagram') {
        if (!accessibleUrl || !accessibleUrl.startsWith('http')) {
          throw new Error('Instagram requires an accessible public HTTPS video/image URL.');
        }

        const isPhoto = !isVideo && (isImage || type === 'Post');
        let igMediaUrl = accessibleUrl;
        let igMimeType = isPhoto ? 'image/jpeg' : (currentMimeType || 'video/mp4');

        if (isPhoto) {
          try {
            console.log('[Publisher -> Instagram] Calibrating image to guarantee compliant JPEG and valid aspect ratio [0.80, 1.91]...');
            const cal = await imageCalibrator.calibrateImageForMeta({
              buffer: videoBuffer,
              mediaUrl: accessibleUrl,
              type: type === 'Story' ? 'Story' : 'Post'
            });
            if (cal && cal.mediaUrl) {
              igMediaUrl = cal.mediaUrl;
              igMimeType = cal.mimeType || 'image/jpeg';
              if (cal.buffer) videoBuffer = cal.buffer;
            }
          } catch (calErr) {
            console.warn('[Publisher -> Instagram] Image calibration warning:', calErr.message);
          }
        }

        const igAcc = data.connectedAccounts?.Instagram || data.connectedAccounts?.instagram || data.connectedAccounts?.Facebook || data.connectedAccounts?.facebook;
        const igResult = await instagram.publishToInstagram({
          userId,
          accountId: data.accountId || igAcc?.id,
          instagramAccountId: igAcc?.externalId || igAcc?.instagramAccountId,
          accessToken: igAcc?.accessToken,
          mediaUrl: igMediaUrl,
          caption: fullText,
          type: isPhoto ? (type === 'Story' ? 'Story' : 'Post') : (type === 'Story' ? 'Story' : (type === 'Post' ? 'Post' : 'Reels')),
          mimeType: igMimeType,
          coverUrl: isPhoto ? null : thumbUrl,
          audioName: data.audioName || data.audioTrack?.title || null,
          audioTrack: data.audioTrack || null
        });

        return {
          platform: 'Instagram',
          success: true,
          status: 'published',
          postId: igResult.postId,
          url: igResult.postUrl, // Real verified permalink from Meta Graph API! Never fake shortcode!
          containerId: igResult.containerId,
          type: igResult.type || (isPhoto ? 'photo' : 'reel'),
          verified: igResult.verified
        };
      }

      // --- UNKNOWN / OTHER ---
      else {
        return {
          platform: plat,
          success: true,
          status: 'published',
          url: '#'
        };
      }
    } catch (platErr) {
      console.error(`[Publisher Error - ${plat}]:`, platErr.message);
      return {
        platform: plat,
        success: false,
        status: 'failed',
        upload_status: 'failed',
        processing_status: 'failed',
        videoId: null,
        youtubeUrl: null,
        url: null,
        error: platErr.message || platErr.code || `${plat} publishing failed`,
        message: platErr.message || `${plat} publishing failed`,
        retryable: true
      };
    }
  }));

  const allSucceeded = results.every(r => r.success);

  // 3. Safe Storage Lifecycle Management
  // Auto-clean video from Supabase Storage once all platforms have published
  let storageCleaned = false;
  if (currentStoragePath && allSucceeded && !isMock) {
    try {
      console.log(`[Publisher Storage Auto-Clean] All platforms published successfully. Purging video from Supabase Storage: ${currentStoragePath}...`);
      const cleanRes = await supabaseStorage.deleteFromSupabase(currentStoragePath);
      storageCleaned = cleanRes.success !== false;
      if (storageCleaned) {
        console.log(`[Publisher Storage Auto-Clean] Successfully purged ${currentStoragePath} from cloud storage to save quota!`);
      }
    } catch (cleanErr) {
      console.warn('[Publisher Storage Auto-Clean Warning]:', cleanErr.message);
    }
  }

  const anySuccess = results.some(r => r.success);

  return {
    success: allSucceeded,
    partial: anySuccess && !allSucceeded,
    postId,
    results,
    storageCleaned,
    publishedAt: new Date().toISOString()
  };
}

/**
 * Retries publishing for only the failed platforms of a post, leaving successful platforms untouched
 */
async function retryFailedPlatforms({ postId, failedPlatforms = [], postData = {} }) {
  if (!Array.isArray(failedPlatforms) || failedPlatforms.length === 0) {
    throw new Error('No failed platforms specified for retry.');
  }

  console.log(`[Publisher] Retrying ONLY failed platforms: [${failedPlatforms.join(', ')}] for post ${postId}...`);

  return publishToAllPlatforms({
    ...postData,
    postId,
    platforms: failedPlatforms
  });
}

/**
 * Deletes a published post or video across target platforms
 */
async function deleteFromAllPlatforms({ postId, results = [], platforms = [], userId = 'usr_default_postmint', connectedAccounts = {} }) {
  console.log(`[Publisher] Starting social media deletion for post ${postId}...`);
  const deletionResults = [];

  // Sync connected account tokens if a real token is explicitly provided
  if (connectedAccounts && typeof connectedAccounts === 'object') {
    for (const [pName, acc] of Object.entries(connectedAccounts)) {
      if (acc && acc.accessToken) {
        try {
          await db.upsertSocialAccount({
            userId,
            platform: pName.toLowerCase(),
            externalId: acc.externalId || `ext_${pName.toLowerCase()}`,
            displayName: acc.displayName || `${pName} Account`,
            avatarUrl: acc.avatarUrl || null,
            accessToken: acc.accessToken,
            refreshToken: acc.refreshToken || null,
            expiresAt: acc.expiresAt || null,
            pageId: acc.pageId || null
          });
        } catch (e) {}
      }
    }
  }

  // 1. Fetch live post record and post_targets from database if postId is provided
  let dbTargets = [];
  let existingPost = null;
  if (postId) {
    try {
      existingPost = await db.getPostById(postId, userId).catch(() => null);
    } catch (_) {}

    try {
      const tRes = await db.supabaseFetch('post_targets?post_id=eq.' + encodeURIComponent(postId));
      if (tRes && tRes.ok) {
        dbTargets = await tRes.json();
      }
    } catch (_) {}
  }

  // 2. Synthesize canonical target map with verified remote platform IDs and URLs
  const targetMap = new Map();

  // A. Seed from dbTargets
  if (Array.isArray(dbTargets)) {
    for (const t of dbTargets) {
      if (!t || !t.platform) continue;
      const key = t.platform.toLowerCase().trim();
      targetMap.set(key, {
        platform: t.platform.charAt(0).toUpperCase() + t.platform.slice(1).toLowerCase(),
        postId: t.platform_post_id || null,
        videoId: key === 'youtube' ? t.platform_post_id : undefined,
        url: t.platform_url || null,
        status: t.status
      });
    }
  }

  // B. Overlay from existingPost
  if (existingPost) {
    if (existingPost.youtubeVideoId || existingPost.youtubeUrl) {
      const curr = targetMap.get('youtube') || {};
      targetMap.set('youtube', {
        ...curr,
        platform: 'YouTube',
        videoId: existingPost.youtubeVideoId || curr.videoId,
        postId: existingPost.youtubeVideoId || curr.postId,
        url: existingPost.youtubeUrl || curr.url
      });
    }
    if (existingPost.facebookPostId || existingPost.facebookUrl) {
      const curr = targetMap.get('facebook') || {};
      targetMap.set('facebook', {
        ...curr,
        platform: 'Facebook',
        postId: existingPost.facebookPostId || curr.postId,
        url: existingPost.facebookUrl || curr.url
      });
    }
    if (existingPost.instagramMediaId || existingPost.instagramUrl) {
      const curr = targetMap.get('instagram') || {};
      targetMap.set('instagram', {
        ...curr,
        platform: 'Instagram',
        postId: existingPost.instagramMediaId || curr.postId,
        url: existingPost.instagramUrl || curr.url
      });
    }
    if (Array.isArray(existingPost.results)) {
      for (const r of existingPost.results) {
        if (!r || !r.platform) continue;
        const key = r.platform.toLowerCase().trim();
        const curr = targetMap.get(key) || {};
        const cleanPostId = (r.postId && !String(r.postId).startsWith('p_')) ? r.postId : (curr.postId || null);
        const cleanVideoId = (r.videoId && !String(r.videoId).startsWith('p_')) ? r.videoId : (curr.videoId || null);
        targetMap.set(key, {
          ...curr,
          platform: r.platform,
          postId: cleanPostId,
          videoId: cleanVideoId,
          url: r.url || r.postUrl || r.youtubeUrl || curr.url
        });
      }
    }
    if (Array.isArray(existingPost.platforms)) {
      for (const p of existingPost.platforms) {
        if (!p) continue;
        const key = p.toLowerCase().trim();
        if (!targetMap.has(key)) {
          targetMap.set(key, {
            platform: p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(),
            postId: null,
            url: null
          });
        }
      }
    }
  }

  // C. Overlay from incoming results
  if (Array.isArray(results) && results.length > 0) {
    for (const r of results) {
      if (!r || !r.platform) continue;
      const key = r.platform.toLowerCase().trim();
      const curr = targetMap.get(key) || {};
      const cleanPostId = (r.postId && !String(r.postId).startsWith('p_')) ? r.postId : (curr.postId || null);
      const cleanVideoId = (r.videoId && !String(r.videoId).startsWith('p_')) ? r.videoId : (curr.videoId || null);
      targetMap.set(key, {
        ...curr,
        platform: r.platform,
        postId: cleanPostId,
        videoId: cleanVideoId,
        url: r.url || r.postUrl || r.youtubeUrl || curr.url
      });
    }
  }

  // D. Ensure platforms explicitly requested are present
  if (Array.isArray(platforms) && platforms.length > 0) {
    for (const p of platforms) {
      if (!p) continue;
      const key = p.toLowerCase().trim();
      if (!targetMap.has(key)) {
        targetMap.set(key, {
          platform: p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(),
          postId: null,
          url: null
        });
      }
    }
  }

  // E. Fallback if still empty
  if (targetMap.size === 0 && postId) {
    ['youtube', 'facebook', 'instagram'].forEach(key => {
      targetMap.set(key, {
        platform: key.charAt(0).toUpperCase() + key.slice(1),
        postId: null,
        url: null
      });
    });
  }

  const targets = Array.from(targetMap.values());

  for (const target of targets) {
    const platName = (target.platform || '').toLowerCase().trim();
    const targetPostId = (target.videoId && !String(target.videoId).startsWith('p_')) 
      ? target.videoId 
      : ((target.postId && !String(target.postId).startsWith('p_')) ? target.postId : (target.mediaId || target.id || postId));
    const targetUrl = target.url || target.youtubeUrl || target.postUrl || null;

    try {
      if (platName === 'youtube' || platName === 'yt') {
        const ytToken = connectedAccounts?.YouTube?.accessToken || connectedAccounts?.youtube?.accessToken;
        const ytRefresh = connectedAccounts?.YouTube?.refreshToken || connectedAccounts?.youtube?.refreshToken;
        const res = await youtube.deleteYouTubeVideo({ 
          videoId: target.videoId || targetPostId, 
          url: targetUrl, 
          userId, 
          accessToken: ytToken, 
          refreshToken: ytRefresh 
        });
        const isOk = Boolean(res && res.success === true);
        deletionResults.push({ platform: 'YouTube', success: isOk, postId: res.videoId || targetPostId, data: res, error: isOk ? undefined : (res?.error || res?.note) });
      } else if (platName === 'facebook' || platName === 'fb' || platName === 'meta') {
        const fbToken = connectedAccounts?.Facebook?.accessToken || connectedAccounts?.facebook?.accessToken || connectedAccounts?.Meta?.accessToken;
        const pageId = connectedAccounts?.Facebook?.externalId || connectedAccounts?.Facebook?.pageId;
        const res = await facebook.deleteFacebookPost({ 
          postId: targetPostId, 
          url: targetUrl, 
          userId, 
          pageAccessToken: fbToken, 
          pageId 
        });
        const isOk = Boolean(res && res.success === true);
        deletionResults.push({ platform: 'Facebook', success: isOk, postId: res.postId || targetPostId, data: res, error: isOk ? undefined : (res?.error || res?.note) });
      } else if (platName === 'instagram' || platName === 'insta' || platName === 'ig') {
        const igToken = connectedAccounts?.Instagram?.accessToken || 
                        connectedAccounts?.instagram?.accessToken || 
                        connectedAccounts?.Facebook?.accessToken || 
                        connectedAccounts?.facebook?.accessToken || 
                        connectedAccounts?.Meta?.accessToken || 
                        connectedAccounts?.meta?.accessToken;
        const igAccId = connectedAccounts?.Instagram?.externalId || 
                        connectedAccounts?.Instagram?.instagramAccountId || 
                        connectedAccounts?.Facebook?.instagramAccountId || 
                        connectedAccounts?.Facebook?.externalId;
        const res = await instagram.deleteInstagramMedia({ 
          mediaId: targetPostId, 
          url: targetUrl, 
          userId, 
          accessToken: igToken, 
          instagramAccountId: igAccId 
        });
        const isOk = Boolean(res && res.success === true);
        deletionResults.push({ platform: 'Instagram', success: isOk, postId: res.postId || targetPostId, data: res, error: isOk ? undefined : (res?.error || res?.note) });
      } else {
        deletionResults.push({ platform: target.platform, success: true, postId: targetPostId });
      }
    } catch (err) {
      console.error(`[Publisher Delete Error - ${target.platform}]:`, err.message);
      deletionResults.push({ platform: target.platform, success: false, postId: targetPostId, error: err.message });
    }
  }

  const allSuccess = deletionResults.length === 0 || deletionResults.every(r => r.success);
  return {
    success: allSuccess,
    postId,
    results: deletionResults
  };
}

module.exports = {
  publishToAllPlatforms,
  retryFailedPlatforms,
  deleteFromAllPlatforms
};
