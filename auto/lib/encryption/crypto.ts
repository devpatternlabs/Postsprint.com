import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Recommended 96 bits for GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Derives a consistent 32-byte encryption key from the environment variable.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("TOKEN_ENCRYPTION_KEY environment variable is required in production");
    }
    // Fallback key for local development only
    return crypto.createHash("sha256").update("postflow-dev-insecure-secret-key-32b").digest();
  }

  // If secret is already a 64-character hex string (32 bytes)
  if (secret.length === 64 && /^[0-9a-fA-F]+$/.test(secret)) {
    return Buffer.from(secret, "hex");
  }

  // Otherwise hash it with SHA-256 to ensure exactly 32 bytes
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a plaintext string (e.g. OAuth access token) using AES-256-GCM.
 * Output format: iv:authTag:ciphertext (all in hex)
 */
export function encryptToken(plainText: string): string {
  if (!plainText) {
    throw new Error("Cannot encrypt empty token");
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a previously encrypted token using AES-256-GCM.
 * Throws if the token was tampered with or corrupted.
 */
export function decryptToken(payload: string): string {
  if (!payload) {
    throw new Error("Cannot decrypt empty token payload");
  }

  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
