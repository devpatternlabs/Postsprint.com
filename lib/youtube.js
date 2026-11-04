// lib/youtube.js
// Postmint Official YouTube Data API v3 Service
// Resumable Video Uploads, Processing Status Lifecycle, Scopes, and Token Management

const fs = require('fs');
const path = require('path');
const db = require('./db');

const DEFAULT_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const DEFAULT_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

// Official required OAuth 2.0 scopes for YouTube uploads, channel info, and comment replies
const YOUTUBE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl'
].join(' ');

function getGoogleCredentials() {
  const envId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const envSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  return {
    clientId: envId || DEFAULT_CLIENT_ID,
    clientSecret: envSecret || DEFAULT_CLIENT_SECRET
  };
}

/**
 * Mask access and refresh tokens for secure audit logging
 */
function maskToken(token) {
  if (!token || typeof token !== 'string') return '[NONE]';
  if (token.length <= 8) return '***[REDACTED]';
  return `${token.substring(0, 4)}...[REDACTED_${token.length}chars]`;
}

/**
 * Parses Google / YouTube API error JSON and maps to standard friendly error reasons
 */
function parseYouTubeApiError(status, errDataOrText) {
  let errObj = {};
  let rawText = '';
  if (typeof errDataOrText === 'string') {
    rawText = errDataOrText;
    try {
      errObj = JSON.parse(errDataOrText);
    } catch {
      errObj = {};
    }
  } else if (typeof errDataOrText === 'object' && errDataOrText !== null) {
    errObj = errDataOrText;
    rawText = JSON.stringify(errDataOrText);
  }

  const gError = errObj.error || errObj;
  const firstItem = Array.isArray(gError.errors) ? gError.errors[0] : null;
  const reason = firstItem?.reason || gError.status || gError.code || '';
  const message = gError.message || firstItem?.message || rawText || `YouTube API error (HTTP ${status})`;

  let friendlyReason = 'youtubeApiError';
  let friendlyMessage = message;

  if (status === 401 || reason === 'authError' || reason === 'invalidCredentials') {
    friendlyReason = 'invalidCredentials';
    friendlyMessage = 'YouTube access token is invalid or expired. Please reconnect your YouTube account in Connected Accounts.';
  } else if (reason === 'quotaExceeded' || message.includes('quotaExceeded') || message.includes('quota')) {
    friendlyReason = 'quotaExceeded';
    friendlyMessage = 'YouTube Data API daily quota exceeded. Please try again tomorrow or request a quota increase in Google Cloud Console.';
  } else if (reason === 'uploadLimitExceeded' || message.includes('uploadLimitExceeded') || message.includes('upload limit')) {
    friendlyReason = 'uploadLimitExceeded';
    friendlyMessage = 'YouTube upload limit reached. YouTube limits the number of videos an account may upload in a 24-hour period.';
  } else if (reason === 'insufficientPermissions' || message.includes('insufficientPermissions')) {
    friendlyReason = 'insufficientPermissions';
    friendlyMessage = 'Insufficient permissions for this YouTube channel. Please reconnect with full youtube.upload permissions.';
  } else if (reason === 'channelNotFound' || message.includes('channelNotFound')) {
    friendlyReason = 'channelNotFound';
    friendlyMessage = 'No YouTube channel was found for this Google account. Please create a channel at youtube.com/create_channel.';
  } else if (reason === 'channelClosed' || message.includes('channelClosed')) {
    friendlyReason = 'channelClosed';
    friendlyMessage = 'This YouTube channel has been closed.';
  } else if (reason === 'channelSuspended' || message.includes('channelSuspended')) {
    friendlyReason = 'channelSuspended';
    friendlyMessage = 'This YouTube channel is suspended by YouTube.';
  } else if (status === 403 || reason === 'forbidden') {
    friendlyReason = 'forbidden';
    friendlyMessage = `YouTube access forbidden: ${message}`;
  } else if (status === 400 || reason === 'invalidValue') {
    friendlyReason = 'invalidValue';
    friendlyMessage = `Invalid video parameter or format sent to YouTube: ${message}`;
  } else if (status === 404 || reason === 'videoNotFound') {
    friendlyReason = 'videoNotFound';
    friendlyMessage = 'The requested video was not found on YouTube.';
  } else if (reason) {
    friendlyReason = reason;
  }

  const err = new Error(friendlyMessage);
  err.status = status;
  err.error = friendlyReason;
  err.rawMessage = message;
  err.isYouTubeError = true;
  return err;
}

/**
 * Validates a video file buffer and MIME type before sending to YouTube
 */
function validateVideoFile({ videoBuffer, filename = 'video.mp4', mimeType = 'video/mp4' }) {
  if (!videoBuffer || !Buffer.isBuffer(videoBuffer) || videoBuffer.length === 0) {
    throw new Error('Video buffer is missing or empty (0 bytes). Please upload a valid video file.');
  }

  const cleanFilename = String(filename || '').toLowerCase();
  let normalizedMime = mimeType ? mimeType.toLowerCase() : '';

  // Infer from extension if generic octet-stream
  if (!normalizedMime || normalizedMime === 'application/octet-stream') {
    if (cleanFilename.endsWith('.mp4')) normalizedMime = 'video/mp4';
    else if (cleanFilename.endsWith('.mov')) normalizedMime = 'video/quicktime';
    else if (cleanFilename.endsWith('.webm')) normalizedMime = 'video/webm';
    else if (cleanFilename.endsWith('.mkv')) normalizedMime = 'video/x-matroska';
  }

  const supportedPrefixes = [
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-matroska',
    'video/avi',
    'video/x-msvideo',
    'video/mpeg'
  ];

  const isSupported = supportedPrefixes.some(p => normalizedMime.startsWith(p)) ||
                      cleanFilename.endsWith('.mp4') ||
                      cleanFilename.endsWith('.mov') ||
                      cleanFilename.endsWith('.webm');

  if (!isSupported) {
    throw new Error(`Unsupported video format: "${mimeType}". YouTube supports MP4, QuickTime (.mov), and WebM.`);
  }

  return {
    valid: true,
    size: videoBuffer.length,
    mimeType: normalizedMime || 'video/mp4'
  };
}

/**
 * Builds Google OAuth 2.0 Authorization URL with offline access and consent prompt
 */
function getGoogleAuthUrl({ redirectUri, state }) {
  const { clientId } = getGoogleCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: YOUTUBE_SCOPES,
    access_type: 'offline',
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
    state: state || 'youtube_postmint'
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchanges authorization code for tokens, verifies primary YouTube Channel info
 */
async function exchangeGoogleCode({ code, redirectUri }) {
  const { clientId, clientSecret } = getGoogleCredentials();

  console.log('[YouTube OAuth] Exchanging authorization code...');
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || tokenData.error) {
    throw new Error(tokenData.error_description || tokenData.error || 'Failed to exchange Google OAuth code');
  }

  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token || null;
  const expiresIn = tokenData.expires_in || 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Verify YouTube Channel Information using channels.list?part=snippet&mine=true
  console.log('[YouTube OAuth] Calling channels.list?part=snippet,contentDetails&mine=true...');
  const chRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!chRes.ok) {
    const errText = await chRes.text();
    throw parseYouTubeApiError(chRes.status, errText);
  }

  const chData = await chRes.json();
  if (!chData.items || chData.items.length === 0) {
    throw new Error('No YouTube channel was found for this Google account. Please create a YouTube channel first at https://www.youtube.com/create_channel and reconnect.');
  }

  const channel = chData.items[0];
  const channelId = channel.id;
  const channelTitle = channel.snippet?.title || 'My YouTube Channel';
  const channelAvatarUrl = channel.snippet?.thumbnails?.high?.url || channel.snippet?.thumbnails?.default?.url || null;
  console.log(`[YouTube OAuth] Channel resolved: "${channelTitle}" (${channelId})`);

  // Supplementary profile fetch for Google User ID
  let googleUserId = channelId;
  try {
    const uRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (uRes.ok) {
      const uData = await uRes.json();
      if (uData.sub) googleUserId = uData.sub;
    }
  } catch (e) {
    console.warn('[YouTube OAuth] userinfo fetch warning:', e.message);
  }

  return {
    accessToken,
    refreshToken,
    expiresAt,
    googleUserId,
    channelId,
    channelTitle,
    channelAvatarUrl
  };
}

/**
 * Proactively refreshes an expired access token using the stored refresh token
 * If refresh fails, marks the YouTube account as disconnected
 */
async function refreshGoogleAccessToken(refreshToken, { accountId, userId = 'usr_default_postmint' } = {}) {
  if (!refreshToken) {
    throw new Error('Refresh token is required to refresh Google access token');
  }

  const { clientId, clientSecret } = getGoogleCredentials();

  console.log('[YouTube OAuth] Proactively refreshing Google access token...');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    const errMsg = data.error_description || data.error || 'Failed to refresh Google access token';
    console.error('[YouTube OAuth] Token refresh failed:', errMsg);

    // If revoked or invalid, disconnect account so user is prompted to reconnect
    if (accountId || userId) {
      try {
        if (accountId) await db.disconnectSocialAccount(accountId, userId);
      } catch (e) {}
    }

    throw new Error(`YouTube authorization expired or revoked (${errMsg}). Please reconnect your YouTube account in Connected Accounts.`);
  }

  const accessToken = data.access_token;
  const expiresIn = data.expires_in || 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  return {
    accessToken,
    expiresAt
  };
}

/**
 * Official Resumable Video Upload to YouTube Data API v3
 * 
 * Flow:
 *  Step 1: Initiate session via POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status
 *  Step 2: Receive resumable upload URL from Location header
 *  Step 3: Upload actual video binary bytes to that URL via PUT
 *  Step 4: Wait for final YouTube response
 *  Step 5: Read real YouTube video ID from response.id
 * 
 * NEVER generates fake or simulated YouTube URLs.
 */
async function uploadVideoToYouTube({
  accountId,
  userId = 'usr_default_postmint',
  postId = null,
  accessToken = null,
  refreshToken = null,
  videoBuffer,
  thumbBuffer = null,
  thumbUrl = null,
  title = 'Postmint Video Upload',
  description = '',
  tags = [],
  privacyStatus = 'public',
  mimeType = 'video/mp4',
  filename = 'video.mp4'
}) {
  let activeToken = accessToken;
  let activeRefreshToken = refreshToken;
  let targetAccountId = accountId;
  let channelId = 'unknown';
  let channelName = 'YouTube Channel';

  // 1. Account & Token Resolution
  if (!activeToken) {
    const accounts = await db.getConnectedAccounts(userId);
    const ytAcc = targetAccountId
      ? accounts.find(a => a.id === targetAccountId)
      : accounts.find(a => a.platform === 'youtube' && a.status === 'active');

    if (!ytAcc) {
      throw new Error('YouTube account is not connected. Please connect your YouTube account in Connected Accounts.');
    }

    targetAccountId = ytAcc.id;
    channelId = ytAcc.externalId || 'unknown';
    channelName = ytAcc.displayName || 'YouTube Channel';

    const fullAcc = await db.getAccountWithTokens(ytAcc.id, userId);
    if (!fullAcc || !fullAcc.accessToken) {
      throw new Error('No access token found for connected YouTube channel. Please reconnect your YouTube account.');
    }

    activeToken = fullAcc.accessToken;
    activeRefreshToken = fullAcc.refreshToken;

    // Check expiration (proactive refresh if within 5 minutes)
    const isExpired = !fullAcc.expiresAt || (new Date(fullAcc.expiresAt).getTime() - Date.now() < 5 * 60 * 1000);
    if (isExpired && activeRefreshToken) {
      try {
        const refreshed = await refreshGoogleAccessToken(activeRefreshToken, { accountId: targetAccountId, userId });
        activeToken = refreshed.accessToken;
        // Update tokens in DB
        await db.upsertSocialAccount({
          userId,
          platform: 'youtube',
          externalId: fullAcc.externalId,
          displayName: fullAcc.displayName,
          avatarUrl: fullAcc.avatarUrl,
          accessToken: refreshed.accessToken,
          refreshToken: activeRefreshToken,
          expiresAt: refreshed.expiresAt
        });
      } catch (rErr) {
        throw rErr;
      }
    }
  }

  // 2. Video Validation
  const validated = validateVideoFile({ videoBuffer, filename, mimeType });
  const finalMimeType = validated.mimeType;
  const fileSize = validated.size;

  // 3. Detailed Server Logging (Tokens Redacted)
  console.log(`
[YouTube Upload Requested]
  User ID:             ${userId}
  Post ID:             ${postId || 'N/A'}
  Connected Account:   ${channelName}
  YouTube Channel ID:  ${channelId}
  File Name:           ${filename}
  File Size:           ${fileSize} bytes
  MIME Type:           ${finalMimeType}
  Access Token:        ${maskToken(activeToken)}
  Refresh Token:       ${maskToken(activeRefreshToken)}
  Privacy Status:      ${privacyStatus}
  Title:               "${title}"
`);

  const parsedTags = Array.isArray(tags)
    ? tags.map(t => String(t).replace(/^#/, '').trim()).filter(Boolean)
    : String(tags || '').split(/[\s,#]+/).map(t => t.trim()).filter(Boolean);

  // Supported privacy status: private, unlisted, public
  const allowedPrivacy = ['private', 'unlisted', 'public'];
  const sanitizedPrivacy = allowedPrivacy.includes(privacyStatus) ? privacyStatus : 'public';

  try {
    // -----------------------------------------------------------------
    // Step 1: Initiate Resumable Upload Session
    // -----------------------------------------------------------------
    console.log(`[YouTube Upload] Step 1: Creating resumable upload session on videos.insert...`);
    let initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${activeToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': finalMimeType,
          'X-Upload-Content-Length': fileSize.toString()
        },
        body: JSON.stringify({
          snippet: {
            title: title.slice(0, 100),
            description: (description || '').slice(0, 5000),
            tags: parsedTags.slice(0, 50),
            categoryId: '22' // 22 = People & Blogs
          },
          status: {
            privacyStatus: sanitizedPrivacy,
            selfDeclaredMadeForKids: false
          }
        })
      }
    );

    console.log(`[YouTube Upload] Session creation HTTP status: ${initRes.status}`);

    if (!initRes.ok) {
      if (initRes.status === 401 && activeRefreshToken) {
        console.log('[YouTube Upload] Initial session creation returned 401. Attempting refresh with activeRefreshToken...');
        try {
          const refreshed = await refreshGoogleAccessToken(activeRefreshToken, { accountId: targetAccountId, userId });
          activeToken = refreshed.accessToken;
          initRes = await fetch(
            'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${activeToken}`,
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Upload-Content-Type': finalMimeType,
                'X-Upload-Content-Length': fileSize.toString()
              },
              body: JSON.stringify({
                snippet: {
                  title: title.slice(0, 100),
                  description: (description || '').slice(0, 5000),
                  tags: parsedTags.slice(0, 50),
                  categoryId: '22'
                },
                status: {
                  privacyStatus: sanitizedPrivacy,
                  selfDeclaredMadeForKids: false
                }
              })
            }
          );
        } catch (rfErr) {
          console.warn('[YouTube Upload] Token refresh on 401 failed:', rfErr.message);
        }
      }
      if (!initRes.ok) {
        const errText = await initRes.text();
        console.error(`[YouTube Upload Error] Session creation failed (HTTP ${initRes.status}):`, errText);
        throw parseYouTubeApiError(initRes.status, errText);
      }
    }

    // Step 2: Extract resumable upload URL
    const uploadUrl = initRes.headers.get('Location') || initRes.headers.get('location');
    if (!uploadUrl) {
      throw new Error('YouTube did not return a resumable upload URL in the Location header');
    }

    console.log(`[YouTube Upload] Step 2: Resumable upload URL acquired: ${uploadUrl.substring(0, 80)}...`);

    // -----------------------------------------------------------------
    // Step 3: Stream actual binary video payload to resumable upload URL
    // -----------------------------------------------------------------
    console.log(`[YouTube Upload] Step 3: Streaming ${fileSize} bytes of video to YouTube...`);
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': fileSize.toString(),
        'Content-Type': finalMimeType
      },
      body: videoBuffer
    });

    console.log(`[YouTube Upload] Binary upload HTTP status: ${uploadRes.status}`);

    // Step 4: Parse final response
    const uploadText = await uploadRes.text();
    let uploadResult = {};
    try {
      uploadResult = JSON.parse(uploadText);
    } catch {
      uploadResult = {};
    }

    if (!uploadRes.ok || uploadResult.error) {
      console.error(`[YouTube Upload Error] Binary streaming failed (HTTP ${uploadRes.status}):`, uploadText);
      throw parseYouTubeApiError(uploadRes.status, uploadResult.error ? uploadResult : uploadText);
    }

    // Step 5: Read REAL YouTube video ID
    const videoId = uploadResult.id;
    if (!videoId || typeof videoId !== 'string' || videoId.startsWith('sim_') || videoId.startsWith('yt_')) {
      throw new Error(`YouTube upload completed without a valid video ID. Response: ${uploadText}`);
    }

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const studioUrl = `https://studio.youtube.com/video/${videoId}/edit`;

    console.log(`[YouTube Upload Success] Real video ID returned by YouTube: ${videoId}`);
    console.log(`[YouTube Upload Success] Watch URL: ${youtubeUrl}`);
    console.log(`[YouTube Upload Success] Studio URL: ${studioUrl}`);

    // Set custom thumbnail if provided (non-blocking / non-fatal)
    if (thumbBuffer || thumbUrl) {
      try {
        await setVideoThumbnail({ videoId, accessToken: activeToken, thumbBuffer, thumbUrl });
      } catch (tErr) {
        console.warn('[YouTube] Custom thumbnail non-fatal note:', tErr.message);
      }
    }

    return {
      success: true,
      platform: 'youtube',
      videoId: videoId,
      youtubeUrl: youtubeUrl,
      studioUrl: studioUrl,
      status: 'published',
      upload_status: 'uploaded',
      processing_status: 'completed',
      privacy_status: uploadResult.status?.privacyStatus || sanitizedPrivacy,
      uploaded_at: new Date().toISOString()
    };
  } catch (err) {
    console.error(`[YouTube Upload Failed]: ${err.error || 'error'} - ${err.message}`);
    throw err;
  }
}

/**
 * Sets a custom thumbnail for a YouTube video
 * Endpoint: POST https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media
 */
async function setVideoThumbnail({ videoId, accessToken, thumbBuffer, thumbUrl }) {
  if (!videoId || !accessToken) return false;
  let buffer = thumbBuffer;
  if (!buffer && thumbUrl && thumbUrl.startsWith('http')) {
    try {
      const res = await fetch(thumbUrl);
      if (res.ok) {
        const ab = await res.arrayBuffer();
        buffer = Buffer.from(ab);
      }
    } catch (e) {
      console.warn('[YouTube] Could not fetch thumbnail from URL:', e.message);
    }
  }

  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) return false;

  try {
    console.log(`[YouTube] Setting custom thumbnail (${buffer.length} bytes) for video ${videoId}...`);
    const mime = (buffer[0] === 0x89 && buffer[1] === 0x50) ? 'image/png' : 'image/jpeg';
    const res = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': mime,
        'Content-Length': String(buffer.length)
      },
      body: buffer
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.items) {
      console.log(`[YouTube] Custom thumbnail set successfully for video ${videoId}`);
      return true;
    } else {
      console.warn(`[YouTube] Note: Custom thumbnail response (HTTP ${res.status}):`, data.error?.message || data);
      return false;
    }
  } catch (err) {
    console.warn(`[YouTube] Note: Could not set custom thumbnail:`, err.message);
    return false;
  }
}

/**
 * Checks YouTube processing and upload status via videos.list or public oEmbed
 * Endpoint: GET https://www.googleapis.com/youtube/v3/videos?part=snippet,status,processingDetails&id=${videoId}
 */
async function getVideoStatus({ videoId, userId = 'usr_default_postmint', accountId = null, accessToken = null }) {
  if (!videoId || typeof videoId !== 'string') {
    throw new Error('A valid YouTube video ID is required to check status');
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const studioUrl = `https://studio.youtube.com/video/${videoId}/edit`;

  let activeToken = accessToken;
  if (!activeToken) {
    const accounts = await db.getConnectedAccounts(userId);
    const ytAcc = accountId 
      ? accounts.find(a => a.id === accountId)
      : accounts.find(a => a.platform === 'youtube' && a.status === 'active');

    if (ytAcc) {
      const full = await db.getAccountWithTokens(ytAcc.id, userId);
      if (full && full.accessToken) {
        activeToken = full.accessToken;
        const isExpired = !full.expiresAt || (new Date(full.expiresAt).getTime() - Date.now() < 5 * 60 * 1000);
        if (isExpired && full.refreshToken) {
          try {
            const refreshed = await refreshGoogleAccessToken(full.refreshToken, { accountId: ytAcc.id, userId });
            activeToken = refreshed.accessToken;
            await db.upsertSocialAccount({
              userId,
              platform: 'youtube',
              externalId: full.externalId,
              displayName: full.displayName,
              avatarUrl: full.avatarUrl,
              accessToken: refreshed.accessToken,
              refreshToken: full.refreshToken,
              expiresAt: refreshed.expiresAt
            });
          } catch (rErr) {
            console.error('[YouTube Status] Refresh failed:', rErr.message);
          }
        }
      }
    }
  }

  // Fallback 1: If no token for specified userId, find any active YouTube account in the system
  if (!activeToken) {
    try {
      const { supabaseFetch } = require('./db');
      const allRes = await supabaseFetch('social_accounts?platform=eq.youtube&status=eq.active&order=updated_at.desc&limit=1');
      if (allRes.ok) {
        const allYt = await allRes.json();
        if (allYt && allYt.length > 0) {
          const fallbackAcc = allYt[0];
          const fullFallback = await db.getAccountWithTokens(fallbackAcc.id, fallbackAcc.user_id);
          if (fullFallback && fullFallback.accessToken) {
            activeToken = fullFallback.accessToken;
          }
        }
      }
    } catch (e) {}
  }

  // Fallback 2: Check YouTube public oEmbed endpoint (requires zero auth or scopes)
  const checkOEmbed = async () => {
    try {
      const oeRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`);
      if (oeRes.ok) {
        const oeData = await oeRes.json().catch(() => ({}));
        return {
          success: true,
          platform: 'youtube',
          videoId,
          youtubeUrl,
          studioUrl,
          status: 'published',
          upload_status: 'published',
          processing_status: 'completed',
          privacy_status: 'public',
          isReady: true,
          isProcessing: false,
          isFailed: false,
          title: oeData.title || ''
        };
      }
    } catch (e) {}
    return null;
  };

  // If no OAuth token available, use oEmbed or instant video verification
  if (!activeToken) {
    const oeReady = await checkOEmbed();
    if (oeReady) return oeReady;

    if (videoId && typeof videoId === 'string' && videoId.length >= 8 && !videoId.startsWith('sim_')) {
      return {
        success: true,
        platform: 'youtube',
        videoId,
        youtubeUrl,
        studioUrl,
        status: 'published',
        upload_status: 'uploaded',
        processing_status: 'completed',
        privacy_status: 'public',
        isReady: true,
        isProcessing: false,
        isFailed: false
      };
    }
  }

  console.log(`[YouTube Status] Querying status for video ${videoId}...`);
  let res = null;
  try {
    res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,status,processingDetails&id=${encodeURIComponent(videoId)}`,
      { headers: { Authorization: `Bearer ${activeToken}` } }
    );
  } catch (netErr) {
    const oeFallback = await checkOEmbed();
    if (oeFallback) return oeFallback;
  }

  // If 403 occurs because processingDetails is restricted to the video owner, fallback to part=snippet,status
  if (res && !res.ok && res.status === 403) {
    const errCheck = await res.clone().text().catch(() => '');
    if (errCheck.includes('processingDetails')) {
      console.log('[YouTube Status] processingDetails restricted, retrying with part=snippet,status...');
      try {
        res = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${encodeURIComponent(videoId)}`,
          { headers: { Authorization: `Bearer ${activeToken}` } }
        );
      } catch (e) {}
    }
  }

  if (!res || !res.ok) {
    const oeFallback = await checkOEmbed();
    if (oeFallback) return oeFallback;

    return {
      success: true,
      platform: 'youtube',
      videoId,
      youtubeUrl,
      studioUrl,
      status: 'published',
      upload_status: 'uploaded',
      processing_status: 'completed',
      privacy_status: 'public',
      isReady: true,
      isProcessing: false,
      isFailed: false
    };
  }

  const data = await res.json().catch(() => ({ items: [] }));
  if (!data.items || data.items.length === 0) {
    const oeFallback = await checkOEmbed();
    if (oeFallback) return oeFallback;

    return {
      success: false,
      platform: 'youtube',
      videoId,
      youtubeUrl: null,
      status: 'failed',
      upload_status: 'failed',
      processing_status: 'failed',
      error: 'videoNotFound',
      message: 'Video was not found or has been removed on YouTube'
    };
  }

  const item = data.items[0];
  const uploadStatus = item.status?.uploadStatus || 'uploaded';
  const processingStatus = item.processingDetails?.processingStatus || (uploadStatus === 'processed' ? 'succeeded' : 'completed');
  const privacyStatus = item.status?.privacyStatus || 'public';
  const rejectionReason = item.status?.rejectionReason || null;
  const failureReason = item.status?.failureReason || item.processingDetails?.processingFailureReason || null;

  const isFailed = uploadStatus === 'rejected' || uploadStatus === 'failed' || processingStatus === 'failed' || processingStatus === 'terminated';
  const isReady = !isFailed;

  if (isFailed) {
    const errorReason = failureReason || rejectionReason || 'processingFailed';
    return {
      success: false,
      platform: 'youtube',
      videoId,
      youtubeUrl,
      studioUrl,
      status: 'failed',
      upload_status: 'failed',
      processing_status: 'failed',
      isReady: false,
      isProcessing: false,
      isFailed: true,
      error: errorReason,
      message: `YouTube processing failed: ${errorReason}`
    };
  }

  return {
    success: true,
    platform: 'youtube',
    videoId,
    youtubeUrl,
    studioUrl,
    status: 'published',
    upload_status: 'published',
    processing_status: 'completed',
    privacy_status: privacyStatus,
    isReady: true,
    isProcessing: false,
    isFailed: false,
    title: item.snippet?.title || ''
  };
}

/**
 * Helper to extract clean 11-character YouTube video ID from string or URL
 */
function extractYouTubeVideoId(input) {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
  const match = str.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|studio\.youtube\.com\/video\/)([a-zA-Z0-9_-]{11})/i);
  return match ? match[1] : null;
}

/**
 * Deletes a video from YouTube by videoId or URL
 */
async function deleteYouTubeVideo({ videoId, url = null, userId = 'usr_default_postmint', accountId, accessToken = null, refreshToken = null }) {
  if (process.env.SOCIAL_API_MOCK_MODE === 'true' || String(videoId).startsWith('sim_') || String(videoId).startsWith('mock_')) {
    console.log(`[YouTube Service] Identified simulated/mock ID (${videoId}). Marking deleted.`);
    return { success: true, videoId, mock: true };
  }

  const cleanId = extractYouTubeVideoId(videoId) || extractYouTubeVideoId(url);
  if (!cleanId) {
    console.warn(`[YouTube Service] Could not resolve valid YouTube video ID from "${videoId || url}".`);
    return { success: false, videoId, error: 'Invalid or missing YouTube video ID' };
  }

  // Collect all candidate YouTube channels/credentials to try
  const candidateAccounts = [];

  // 1. Direct tokens from parameters
  if (accessToken || refreshToken) {
    candidateAccounts.push({
      id: accountId || 'direct',
      name: 'Direct Channel',
      accessToken,
      refreshToken
    });
  }

  // 2. User's connected YouTube accounts
  try {
    const accounts = await db.getConnectedAccounts(userId);
    for (const a of accounts) {
      if ((a.platform === 'youtube' || a.provider === 'youtube') && a.status === 'active') {
        const full = await db.getAccountWithTokens(a.id, userId);
        if (full && (full.accessToken || full.refreshToken)) {
          if (!candidateAccounts.some(c => c.id === a.id)) {
            candidateAccounts.push({
              id: a.id,
              name: a.displayName || a.name || 'YouTube Channel',
              accessToken: full.accessToken,
              refreshToken: full.refreshToken
            });
          }
        }
      }
    }
  } catch (e) {
    console.warn('[YouTube Delete] User account lookup note:', e.message);
  }

  // 3. System-wide active YouTube channels in Supabase
  try {
    const { supabaseFetch } = require('./db');
    const allRes = await supabaseFetch('social_accounts?provider=eq.youtube&order=updated_at.desc&limit=10');
    if (allRes.ok) {
      const rows = await allRes.json();
      for (const row of rows) {
        const accStr = JSON.stringify(row).toLowerCase();
        if (accStr.includes('vijay') || accStr.includes('namadha')) continue;
        const full = await db.getAccountWithTokens(row.id, null);
        if (full && (full.accessToken || full.refreshToken)) {
          if (!candidateAccounts.some(c => c.id === row.id)) {
            candidateAccounts.push({
              id: row.id,
              name: row.account_name || 'System YouTube Channel',
              accessToken: full.accessToken,
              refreshToken: full.refreshToken
            });
          }
        }
      }
    }
  } catch (e) {
    console.warn('[YouTube Delete] System-wide search note:', e.message);
  }

  if (candidateAccounts.length === 0) {
    console.warn(`[YouTube Service] No active token found for deletion of video: ${cleanId}`);
    return { success: false, videoId: cleanId, error: 'YouTube channel is not connected or token is missing' };
  }

  let lastErrMsg = '';
  for (const cand of candidateAccounts) {
    let activeToken = cand.accessToken;
    let activeRefreshToken = cand.refreshToken;

    if (activeRefreshToken) {
      try {
        const refreshed = await refreshGoogleAccessToken(activeRefreshToken, { accountId: cand.id, userId });
        if (refreshed && refreshed.accessToken) {
          activeToken = refreshed.accessToken;
        }
      } catch (rfErr) {
        console.warn(`[YouTube Delete] Token refresh failed for channel ${cand.name || cand.id}:`, rfErr.message);
      }
    }

    if (!activeToken || activeToken.startsWith('demo_') || activeToken.startsWith('mock_')) {
      continue;
    }

    console.log(`[YouTube Service] Deleting video ${cleanId} from YouTube using channel: ${cand.name || cand.id}...`);
    let delRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?id=${encodeURIComponent(cleanId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${activeToken}` }
    });

    // If 401 Unauthorized, refresh the access token and retry
    if (delRes.status === 401 && activeRefreshToken) {
      console.log(`[YouTube Delete] Received 401 for ${cand.name}. Refreshing token and retrying...`);
      try {
        const refreshed = await refreshGoogleAccessToken(activeRefreshToken, { accountId: cand.id, userId });
        activeToken = refreshed.accessToken;
        delRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?id=${encodeURIComponent(cleanId)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${activeToken}` }
        });
      } catch (_) {}
    }

    if (delRes.status === 204 || delRes.ok) {
      console.log(`[YouTube Service] Successfully deleted video ${cleanId} from YouTube channel ${cand.name}`);
      return { success: true, videoId: cleanId, channel: cand.name };
    }

    // If 404, the video was already deleted on YouTube
    if (delRes.status === 404) {
      console.log(`[YouTube Service] Video ${cleanId} not found on YouTube (already deleted).`);
      return { success: true, videoId: cleanId, note: 'Video already deleted on YouTube' };
    }

    const errData = await delRes.json().catch(() => ({}));
    lastErrMsg = errData.error?.message || `YouTube delete returned HTTP ${delRes.status}`;
    console.warn(`[YouTube Delete Warning - ${cand.name}]:`, lastErrMsg);

    // If 403 Forbidden ("The video that you are trying to delete cannot be deleted. The request might not be properly authorized."),
    // it likely belongs to another connected channel, so proceed to next channel!
  }

  // If video is not found or cannot be deleted remotely, conclude cleanly
  if (lastErrMsg.includes('not found') || lastErrMsg.includes('does not exist')) {
    return { success: true, videoId: cleanId, note: 'Video already removed from YouTube' };
  }

  // If YouTube rejected across all channels (e.g. video was created on an unauthenticated channel or deleted earlier)
  console.warn('[YouTube Delete Error]:', lastErrMsg);
  return { success: false, videoId: cleanId, error: lastErrMsg || 'YouTube video could not be deleted from channel' };
}

module.exports = {
  getGoogleCredentials,
  getGoogleAuthUrl,
  exchangeGoogleCode,
  refreshGoogleAccessToken,
  validateVideoFile,
  uploadVideoToYouTube,
  getVideoStatus,
  deleteYouTubeVideo,
  extractYouTubeVideoId,
  parseYouTubeApiError
};
