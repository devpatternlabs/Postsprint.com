// lib/crypto.js
// Postmint Security Engine: AES-256-GCM Token Encryption & HMAC-SHA256 OAuth State

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for AES-GCM
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag

/**
 * Derives a consistent 32-byte encryption key buffer from TOKEN_ENCRYPTION_KEY.
 * Guaranteed to be 32 bytes (256 bits).
 */
function getEncryptionKey() {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.AUTH_SECRET || 'postsprint_production_sec_key_2026';
  
  // If provided as a 64-character hex string (32 bytes)
  if (secret.length === 64 && /^[0-9a-fA-F]+$/.test(secret)) {
    return Buffer.from(secret, 'hex');
  }

  // Otherwise SHA-256 hash it to guarantee an exact 32-byte key
  return crypto.createHash('sha256').update(secret).digest();
}

function getCandidateKeys() {
  const secrets = [
    process.env.TOKEN_ENCRYPTION_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.AUTH_SECRET,
    'postsprint_production_sec_key_2026',
    'postmint_secret_token_encryption_key_32bytes!',
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  ].filter(Boolean);

  const keys = [];
  for (const s of secrets) {
    if (s.length === 64 && /^[0-9a-fA-F]+$/.test(s)) {
      keys.push(Buffer.from(s, 'hex'));
    }
    keys.push(crypto.createHash('sha256').update(s).digest());
  }
  return keys;
}

/**
 * Encrypts a plaintext string (e.g. OAuth access token or refresh token) using AES-256-GCM.
 * Output format: iv:authTag:ciphertext (all formatted as hexadecimal strings).
 * 
 * @param {string} plainText - The token or secret to encrypt
 * @returns {string} iv:authTag:ciphertext
 */
function encryptToken(plainText) {
  if (!plainText || typeof plainText !== 'string') {
    throw new Error('encryptToken requires a non-empty string');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted payload back to plaintext.
 * Tries all candidate keys to ensure backward and forward compatibility.
 * 
 * @param {string} payload - iv:authTag:ciphertext
 * @returns {string} Decrypted plaintext token
 */
function decryptToken(payload) {
  if (!payload || typeof payload !== 'string') {
    throw new Error('decryptToken requires a non-empty string');
  }

  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format. Expected iv:authTag:ciphertext');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const candidateKeys = getCandidateKeys();
  let lastErr = null;

  for (const key of candidateKeys) {
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
      });
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      lastErr = err;
    }
  }

  throw (lastErr || new Error('Failed to decrypt token with any available key'));
}

const DEFAULT_OAUTH_SECRET = 'postsprint_oauth_secure_state_secret_2026';

function getOAuthSecret() {
  return process.env.OAUTH_STATE_SECRET || process.env.TOKEN_ENCRYPTION_KEY || DEFAULT_OAUTH_SECRET;
}

/**
 * Generates an HMAC-SHA256 signed OAuth state parameter to prevent CSRF.
 * Encodes timestamp, userId, and provider into a tamper-proof signed token.
 * 
 * @param {object} payload - e.g. { userId, platform, nonce }
 * @returns {string} base64url encoded state string
 */
function generateOAuthState(payload = {}) {
  const secret = getOAuthSecret();
  const data = JSON.stringify({
    ...payload,
    ts: Date.now(),
    nonce: crypto.randomBytes(8).toString('hex')
  });
  const dataB64 = Buffer.from(data, 'utf8').toString('base64url');
  const hmac = crypto.createHmac('sha256', secret).update(dataB64).digest('base64url');
  return `${dataB64}.${hmac}`;
}

/**
 * Validates an HMAC-SHA256 signed OAuth state parameter.
 * Rejects if tampered with or expired (> 15 minutes).
 * 
 * @param {string} stateString - The incoming state parameter
 * @returns {object|null} The verified payload or null if invalid
 */
function verifyOAuthState(stateString, maxAgeMs = 15 * 60 * 1000) {
  if (!stateString || typeof stateString !== 'string') return null;
  const parts = stateString.split('.');
  if (parts.length !== 2) return null;

  const [dataB64, providedHmac] = parts;
  const secret = getOAuthSecret();
  const expectedHmac = crypto.createHmac('sha256', secret).update(dataB64).digest('base64url');

  const bufA = Buffer.from(providedHmac);
  const bufB = Buffer.from(expectedHmac);
  if (bufA.length !== bufB.length) {
    return null;
  }

  // Constant-time comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(bufA, bufB)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(dataB64, 'base64url').toString('utf8'));
    if (Date.now() - payload.ts > maxAgeMs) {
      return null; // Expired state
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * PS-12 Security Hardening: Strictly parses only verified HMAC-SHA256 OAuth states.
 * Rejects unverified, tampered, or unsigned state objects.
 */
function parseOAuthState(stateString, maxAgeMs = 15 * 60 * 1000) {
  if (!stateString || typeof stateString !== 'string') return null;
  return verifyOAuthState(stateString, maxAgeMs);
}

module.exports = {
  encryptToken,
  decryptToken,
  generateOAuthState,
  verifyOAuthState,
  parseOAuthState,
};

