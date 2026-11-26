const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12; // 96-bit IV recommended for AES-GCM
const VERSION_PREFIX = "enc:v1:";

/**
 * Normalizes a 32-byte key from either a 64-character hex string,
 * a 32-character utf8 string, or hashes an arbitrary length passphrase with SHA-256.
 */
function getKeyBuffer(customKey) {
  const secret = customKey || process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "SPOTIFY_TOKEN_ENCRYPTION_KEY environment variable is required for token encryption"
    );
  }

  // If already 64 hex characters (32 bytes)
  if (typeof secret === "string" && /^[0-9a-fA-F]{64}$/.test(secret)) {
    return Buffer.from(secret, "hex");
  }

  // If exactly 32-byte string
  if (Buffer.byteLength(secret, "utf8") === 32) {
    return Buffer.from(secret, "utf8");
  }

  // Otherwise, deterministically hash it to 32 bytes using SHA-256
  return crypto.createHash("sha256").update(String(secret)).digest();
}

/**
 * Encrypts plaintext using AES-256-GCM with a fresh random IV per invocation.
 * Returns: enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
function encryptToken(plaintext, customKey) {
  if (plaintext === null || plaintext === undefined) {
    return plaintext;
  }

  const keyBuffer = getKeyBuffer(customKey);
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

  let ciphertext = cipher.update(String(plaintext), "utf8", "hex");
  ciphertext += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${VERSION_PREFIX}${iv.toString("hex")}:${authTag}:${ciphertext}`;
}

/**
 * Decrypts a ciphertext string created by encryptToken.
 * Includes backward compatibility for unencrypted legacy tokens.
 */
function decryptToken(encryptedString, customKey) {
  if (!encryptedString || typeof encryptedString !== "string") {
    return encryptedString;
  }

  // Check if string follows versioned ciphertext format
  if (!encryptedString.startsWith(VERSION_PREFIX)) {
    // Backward compatibility: If token was saved prior to encryption rollout, return as-is
    return encryptedString;
  }

  const payload = encryptedString.slice(VERSION_PREFIX.length);
  const parts = payload.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format");
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const keyBuffer = getKeyBuffer(customKey);
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Checks if a string has been encrypted with the current scheme.
 */
function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(VERSION_PREFIX);
}

/**
 * Utility to generate a new 256-bit encryption key as a 64-character hex string.
 */
function generateEncryptionKey() {
  return crypto.randomBytes(32).toString("hex");
}

module.exports = {
  encryptToken,
  decryptToken,
  isEncrypted,
  generateEncryptionKey,
  getKeyBuffer,
};
