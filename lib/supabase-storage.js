// lib/supabase-storage.js
// Supabase Cloud Storage Client for High-Quality Video, Story, Reel, and Image Assets
// Handles lossless binary uploads, signed external URLs for Meta/YouTube, and automatic post-publish cleanup

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://oadiscrojgfsszedilwp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || 'social-videos';

/**
 * Upload binary buffer directly to Supabase Storage in original lossless quality
 * Preserves full video resolution (1080p, 4K, 60fps), high bitrates, and clear audio
 * 
 * @param {object} params
 * @param {Buffer} params.buffer - Raw binary buffer
 * @param {string} params.filename - Original filename
 * @param {string} params.mimeType - MIME type e.g. 'video/mp4', 'image/png'
 * @param {string} params.folder - Folder prefix e.g. 'posts', 'reels', 'stories'
 */
async function uploadToSupabase({ buffer, filename, mimeType = 'video/mp4', folder = 'posts' }) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Valid binary buffer is required for Supabase upload');
  }

  const safeFilename = (filename || 'media.mp4').replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${folder}/${Date.now()}_${safeFilename}`;

  console.log(`[Supabase Storage] Uploading ${safeFilename} (${buffer.length} bytes, ${mimeType}) to ${BUCKET_NAME}/${storagePath}...`);

  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${storagePath}`;
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': mimeType,
      'x-upsert': 'true'
    },
    body: buffer
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase upload failed (${res.status}): ${errText}`);
  }

  // Create a signed URL valid for 48 hours for Meta Graph API / YouTube / client preview
  const signedUrl = await createSignedUrl(storagePath, 48 * 3600);
  console.log(`[Supabase Storage] Upload success! Generated signed URL for external delivery.`);

  return {
    success: true,
    storagePath,
    signedUrl,
    size: buffer.length,
    mimeType,
    filename: safeFilename
  };
}

/**
 * Generate signed URL for an object in Supabase Storage
 */
async function createSignedUrl(storagePath, expiresIn = 172800) {
  const cleanPath = storagePath.replace(/^\/+/, '');
  const signUrl = `${SUPABASE_URL}/storage/v1/object/sign/${BUCKET_NAME}/${cleanPath}`;
  const res = await fetch(signUrl, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ expiresIn })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create signed URL (${res.status}): ${err}`);
  }

  const data = await res.json();
  return `${SUPABASE_URL}/storage/v1${data.signedURL}`;
}

/**
 * Download raw binary buffer from Supabase Storage
 */
async function downloadFromSupabase(storagePath) {
  const cleanPath = storagePath.replace(/^\/+/, '');
  console.log(`[Supabase Storage] Downloading binary for: ${cleanPath}...`);
  
  const signed = await createSignedUrl(cleanPath, 3600);
  const fetchSigned = await fetch(signed);
  if (!fetchSigned.ok) {
    throw new Error(`Failed to download from Supabase Storage (${fetchSigned.status})`);
  }
  const ab = await fetchSigned.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * Automatically delete media from Supabase Storage once all platforms have successfully posted
 * Guarantees zero residual cloud storage waste!
 * 
 * @param {string} storagePath - Supabase storage path to purge
 */
async function deleteFromSupabase(storagePath) {
  if (!storagePath) return { success: true };
  const cleanPath = storagePath.replace(/^\/+/, '');
  console.log(`[Supabase Storage Cleanup] Auto-deleting published media: ${cleanPath}...`);

  const deleteUrl = `${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}`;
  const res = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prefixes: [cleanPath] })
  });

  if (!res.ok) {
    const err = await res.text();
    console.warn(`[Supabase Storage Cleanup Warning] Deletion returned HTTP ${res.status}:`, err);
    return { success: false, error: err };
  }

  console.log(`[Supabase Storage Cleanup] Successfully purged ${cleanPath} from Supabase!`);
  return { success: true };
}

async function createSignedUploadUrl({ filename, mimeType = 'video/mp4', folder = 'posts' }) {
  const safeFilename = (filename || 'media.mp4').replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${folder}/${Date.now()}_${safeFilename}`;
  const signUploadUrl = `${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET_NAME}/${storagePath}`;

  const res = await fetch(signUploadUrl, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create signed upload URL (${res.status}): ${err}`);
  }

  const data = await res.json();
  const directUploadUrl = `${SUPABASE_URL}/storage/v1${data.url}`;
  let signedUrl = '';
  try {
    signedUrl = await createSignedUrl(storagePath, 7 * 86400);
  } catch (e) {}

  return {
    success: true,
    storagePath,
    uploadUrl: directUploadUrl,
    signedUrl,
    token: data.token,
    filename: safeFilename,
    mimeType
  };
}

module.exports = {
  SUPABASE_URL,
  BUCKET_NAME,
  uploadToSupabase,
  createSignedUrl,
  createSignedUploadUrl,
  downloadFromSupabase,
  deleteFromSupabase
};
