// lib/image-calibrator.js
// Postmint Automated Image Calibrator for Meta Graph API (Instagram & Facebook)
//
// Meta Graph API single-image feed publishing strictly enforces:
// 1. Format: JPEG only (image/jpeg). PNG/WebP files sent to image_url cause Meta parser errors ("aspect ratio () cannot be published").
// 2. Aspect Ratio: Must be within [0.80, 1.91] (i.e. between 4:5 portrait and 1.91:1 landscape).
//    - Extreme vertical images (e.g. 9:16 = 0.5625) are padded to 4:5 (0.80) with a clean matte border.
//    - Ultra-wide images (> 1.91) are padded to 1.91:1 with a clean matte border.
// 3. Stories (type === 'Story'):
//    - 9:16 is natively supported, but format is strictly converted to JPEG.

const sharp = require('sharp');
const mediaService = require('../services/media-upload');

/**
 * Calibrates an image buffer or URL to ensure full compatibility with Instagram Meta Graph API
 *
 * @param {object} params
 * @param {Buffer} [params.buffer] - Raw image buffer
 * @param {string} [params.mediaUrl] - Public HTTPS URL of the image
 * @param {string} [params.type='Post'] - 'Post' | 'Story' | 'Reels' | 'Video'
 * @returns {Promise<{ mediaUrl: string, storagePath?: string, mimeType: string, buffer?: Buffer, calibrated: boolean, width?: number, height?: number, ar?: number }>}
 */
async function calibrateImageForMeta({ buffer = null, mediaUrl = null, type = 'Post' }) {
  let imageBuffer = buffer;

  // 1. Fetch buffer if missing
  if (!imageBuffer && mediaUrl && mediaUrl.startsWith('http')) {
    try {
      console.log(`[Image Calibrator] Downloading image for Meta calibration from ${mediaUrl.slice(0, 80)}...`);
      const res = await fetch(mediaUrl);
      if (res.ok) {
        const ab = await res.arrayBuffer();
        imageBuffer = Buffer.from(ab);
      }
    } catch (fErr) {
      console.warn('[Image Calibrator] Could not fetch image URL buffer:', fErr.message);
    }
  }

  if (!imageBuffer || !Buffer.isBuffer(imageBuffer) || imageBuffer.length < 8) {
    return {
      mediaUrl,
      mimeType: 'image/jpeg',
      buffer: imageBuffer,
      calibrated: false
    };
  }

  try {
    const meta = await sharp(imageBuffer).metadata();
    if (!meta.width || !meta.height) {
      console.warn('[Image Calibrator] Could not determine dimensions via sharp, passing through.');
      return { mediaUrl, mimeType: 'image/jpeg', buffer: imageBuffer, calibrated: false };
    }

    const ar = meta.width / meta.height;
    const isStory = type === 'Story';
    const isJpeg = meta.format === 'jpeg' || meta.format === 'jpg';

    let needsPadding = false;
    let padLeft = 0;
    let padRight = 0;
    let padTop = 0;
    let padBottom = 0;

    if (!isStory) {
      // Instagram Feed Post allowable range: [0.80, 1.91]
      if (ar < 0.80) {
        // Taller than 4:5 (e.g., 9:16 vertical image 1080x1920 or 3:4 portrait)
        needsPadding = true;
        const targetWidth = Math.round(meta.height * 0.80);
        const totalPad = targetWidth - meta.width;
        padLeft = Math.floor(totalPad / 2);
        padRight = totalPad - padLeft;
        console.log(`[Image Calibrator] Image AR is ${ar.toFixed(4)} (< 0.80). Padding width from ${meta.width}px to ${targetWidth}px (+${totalPad}px) to meet Instagram 4:5 requirements.`);
      } else if (ar > 1.91) {
        // Wider than 1.91:1 (e.g., panoramic image)
        needsPadding = true;
        const targetHeight = Math.round(meta.width / 1.91);
        const totalPad = targetHeight - meta.height;
        padTop = Math.floor(totalPad / 2);
        padBottom = totalPad - padTop;
        console.log(`[Image Calibrator] Image AR is ${ar.toFixed(4)} (> 1.91). Padding height from ${meta.height}px to ${targetHeight}px (+${totalPad}px) to meet Instagram 1.91:1 requirements.`);
      }
    }

    // If already JPEG and within aspect ratio constraints, no alteration needed
    if (isJpeg && !needsPadding) {
      return {
        mediaUrl,
        mimeType: 'image/jpeg',
        buffer: imageBuffer,
        calibrated: false,
        width: meta.width,
        height: meta.height,
        ar: +ar.toFixed(4)
      };
    }

    // Build calibration pipeline
    let pipeline = sharp(imageBuffer);
    if (needsPadding) {
      pipeline = pipeline.extend({
        top: padTop,
        bottom: padBottom,
        left: padLeft,
        right: padRight,
        background: { r: 15, g: 23, b: 42, alpha: 1 } // Sleek matte slate background
      });
    }

    // Convert to high-fidelity JPEG
    const calibratedBuffer = await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    const newMeta = await sharp(calibratedBuffer).metadata();
    const calibratedAr = +(newMeta.width / newMeta.height).toFixed(4);

    console.log(`[Image Calibrator] Successfully calibrated image: ${meta.width}x${meta.height} (${meta.format}) -> ${newMeta.width}x${newMeta.height} (jpeg, AR=${calibratedAr})`);

    // Upload calibrated JPEG to Supabase storage to generate accessible public/signed URL
    const staged = await mediaService.uploadToStorage({
      buffer: calibratedBuffer,
      filename: `meta_calibrated_${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
      folder: 'posts'
    });

    return {
      mediaUrl: staged.signedUrl,
      storagePath: staged.storagePath,
      mimeType: 'image/jpeg',
      buffer: calibratedBuffer,
      calibrated: true,
      width: newMeta.width,
      height: newMeta.height,
      ar: calibratedAr
    };
  } catch (err) {
    console.warn('[Image Calibrator Warning] Calibration error, falling back to original media:', err.message);
    return {
      mediaUrl,
      mimeType: 'image/jpeg',
      buffer: imageBuffer,
      calibrated: false
    };
  }
}

module.exports = {
  calibrateImageForMeta
};
