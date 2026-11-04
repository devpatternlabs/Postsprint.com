// services/media-upload.js
// Postmint Media Upload & Pre-Validation Service
// Validates media formats for Meta Graph API (Instagram Reels & Facebook Videos)
// Manages cloud storage uploads with extended TTL and safe lifecycle management

const supabaseStorage = require('../lib/supabase-storage');

/**
 * Validates media file specifications for Meta (Instagram Reels & Facebook Videos)
 * @param {object} params
 * @param {Buffer} [params.buffer]
 * @param {string} params.mimeType
 * @param {string} [params.filename]
 * @param {number} [params.size]
 * @param {string} [params.type] - 'Reels' | 'Video' | 'Story' | 'Post'
 * @param {string} [params.ratio] - '9:16' | '16:9' | '1:1'
 * @returns {{ valid: boolean, errors: string[], warnings: string[], info: object }}
 */
function validateMedia({ buffer, mimeType = '', filename = '', size = 0, type = 'Post', ratio = '1:1' }) {
  const errors = [];
  const warnings = [];
  const actualSize = buffer ? buffer.length : size;

  const normalizedMime = (mimeType || '').toLowerCase();
  const ext = (filename || '').split('.').pop().toLowerCase();
  const isVideo = normalizedMime.startsWith('video') || ['mp4', 'mov', 'm4v', 'webm'].includes(ext);

  // 1. Post Type vs Media Type compatibility
  if ((type === 'Reels' || type === 'Video') && !isVideo && (normalizedMime || ext)) {
    errors.push(`Format "${type}" requires a video file (.mp4 or .mov). Provided MIME type: "${mimeType || ext || 'unknown'}".`);
  }

  // 2. Format checks for Meta Graph API
  if (isVideo) {
    const supportedVideoMimes = ['video/mp4', 'video/quicktime', 'video/x-m4v'];
    const isSupportedMime = supportedVideoMimes.some(m => normalizedMime.includes(m)) || ['mp4', 'mov', 'm4v'].includes(ext);

    if (!isSupportedMime && normalizedMime) {
      if (normalizedMime.includes('webm')) {
        errors.push('Meta Graph API does not support WebM videos. Please use MP4 (H.264 / AAC) or QuickTime MOV.');
      } else {
        warnings.push(`Video format "${normalizedMime}" may not be accepted by Meta. Recommended format is MP4 with H.264 video and AAC audio.`);
      }
    }

    // Size limit check (Meta Graph API URL upload limit ~100MB-200MB)
    const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
    if (actualSize > MAX_VIDEO_BYTES) {
      errors.push(`Video file size (${(actualSize / (1024 * 1024)).toFixed(1)} MB) exceeds the 100 MB limit for automated social publishing.`);
    }

    // Aspect ratio recommendations for Reels
    if (type === 'Reels' && ratio !== '9:16') {
      warnings.push('Instagram & Facebook Reels are optimized for vertical 9:16 aspect ratio (1080x1920). Non-vertical videos may be letterboxed.');
    }
  } else {
    // Image validation
    const supportedImageMimes = ['image/jpeg', 'image/png', 'image/webp'];
    const isSupportedImg = supportedImageMimes.some(m => normalizedMime.includes(m)) || ['jpg', 'jpeg', 'png', 'webp'].includes(ext);

    if (!isSupportedImg && normalizedMime) {
      errors.push(`Image format "${normalizedMime}" is not supported. Supported formats: JPEG, PNG, WEBP.`);
    }

    const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
    if (actualSize > MAX_IMAGE_BYTES) {
      errors.push(`Image file size (${(actualSize / (1024 * 1024)).toFixed(1)} MB) exceeds the 10 MB limit for social publishing.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    info: {
      isVideo,
      size: actualSize,
      mimeType: normalizedMime || (isVideo ? 'video/mp4' : 'image/jpeg'),
      type,
      ratio
    }
  };
}

/**
 * Uploads media buffer to Supabase Storage with extended signed URL TTL (7 days)
 * @param {object} params
 * @param {Buffer} params.buffer
 * @param {string} params.filename
 * @param {string} params.mimeType
 * @param {string} [params.folder]
 * @returns {Promise<{ storagePath: string, signedUrl: string, size: number, mimeType: string }>}
 */
async function uploadToStorage({ buffer, filename, mimeType = 'video/mp4', folder = 'posts' }) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Valid binary buffer is required for upload');
  }

  const uploadRes = await supabaseStorage.uploadToSupabase({
    buffer,
    filename,
    mimeType,
    folder
  });

  // Re-sign with 7 days (604,800s) TTL to guarantee Meta CDN accessibility during async transcoding
  const longLivedUrl = await supabaseStorage.createSignedUrl(uploadRes.storagePath, 7 * 24 * 3600);

  return {
    storagePath: uploadRes.storagePath,
    signedUrl: longLivedUrl,
    size: buffer.length,
    mimeType: uploadRes.mimeType,
    filename: uploadRes.filename
  };
}

module.exports = {
  validateMedia,
  uploadToStorage
};
