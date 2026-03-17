/**
 * Encryption Utility for Centralized File System
 * Provides AES-256-GCM encryption for sensitive data
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Algorithm configuration
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;  // 128 bits for GCM
const AUTH_TAG_LENGTH = 16;  // 128 bits authentication tag
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;  // 256 bits for AES-256
const PBKDF2_ITERATIONS = 100000;

// Get encryption key from environment or generate a secure default
function getEncryptionKey() {
  let key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    // Check for key file
    const keyPath = path.join(process.cwd(), "config", "keys", "encryption.key");
    if (fs.existsSync(keyPath)) {
      key = fs.readFileSync(keyPath, "utf8").trim();
    }
  }
  
  if (!key) {
    // Generate and save a key for development (NEVER do this in production)
    if (process.env.NODE_ENV !== "production") {
      key = crypto.randomBytes(32).toString("hex");
      const keyDir = path.join(process.cwd(), "config", "keys");
      if (!fs.existsSync(keyDir)) {
        fs.mkdirSync(keyDir, { recursive: true });
      }
      const keyPath = path.join(keyDir, "encryption.key");
      fs.writeFileSync(keyPath, key, { mode: 0o600 });
      console.log("[Encryption] Generated new encryption key for development");
    } else {
      throw new Error("ENCRYPTION_KEY environment variable is required in production");
    }
  }
  
  // Ensure key is proper length
  if (key.length === 64) {
    // Hex-encoded 256-bit key
    return Buffer.from(key, "hex");
  } else if (key.length >= 32) {
    // Use first 32 bytes if longer
    return Buffer.from(key.slice(0, 32), "utf8");
  } else {
    // Derive key from passphrase using PBKDF2
    return crypto.pbkdf2Sync(key, "cfs-salt", PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
  }
}

let encryptionKey = null;

function getKey() {
  if (!encryptionKey) {
    encryptionKey = getEncryptionKey();
  }
  return encryptionKey;
}

/**
 * Encrypt a string value using AES-256-GCM
 * @param {string} plaintext - The string to encrypt
 * @returns {string} - Base64-encoded encrypted string (iv:authTag:ciphertext)
 */
function encrypt(plaintext) {
  if (!plaintext || typeof plaintext !== "string") {
    return plaintext;
  }

  try {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, "utf8", "base64");
    encrypted += cipher.final("base64");
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:ciphertext (all base64)
    return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
  } catch (err) {
    console.error("[Encryption] Error encrypting:", err.message);
    throw new Error("Encryption failed");
  }
}

/**
 * Decrypt a string value encrypted with encrypt()
 * @param {string} encryptedData - The encrypted string (iv:authTag:ciphertext)
 * @returns {string} - The decrypted plaintext
 */
function decrypt(encryptedData) {
  if (!encryptedData || typeof encryptedData !== "string") {
    return encryptedData;
  }

  // Check if it looks like encrypted data
  if (!encryptedData.includes(":")) {
    return encryptedData; // Return as-is if not encrypted format
  }

  try {
    const key = getKey();
    const parts = encryptedData.split(":");
    
    if (parts.length !== 3) {
      return encryptedData; // Not in expected format
    }

    const iv = Buffer.from(parts[0], "base64");
    const authTag = Buffer.from(parts[1], "base64");
    const ciphertext = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (err) {
    console.error("[Encryption] Error decrypting:", err.message);
    return encryptedData; // Return original if decryption fails
  }
}

/**
 * Hash a value using SHA-256 (for non-reversible hashing)
 * @param {string} value - The value to hash
 * @returns {string} - Hex-encoded hash
 */
function hash(value) {
  if (!value) return "";
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Hash with salt for secure comparisons
 * @param {string} value - The value to hash
 * @param {string} salt - Optional salt (generated if not provided)
 * @returns {object} - { hash, salt }
 */
function hashWithSalt(value, salt = null) {
  if (!salt) {
    salt = crypto.randomBytes(SALT_LENGTH).toString("hex");
  }
  const hashed = crypto.pbkdf2Sync(value, salt, PBKDF2_ITERATIONS, 64, "sha512").toString("hex");
  return { hash: hashed, salt };
}

/**
 * Verify a hashed value
 * @param {string} value - The original value
 * @param {string} hashedValue - The stored hash
 * @param {string} salt - The salt used for hashing
 * @returns {boolean}
 */
function verifyHash(value, hashedValue, salt) {
  const { hash: computed } = hashWithSalt(value, salt);
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hashedValue));
}

/**
 * Generate a secure random token
 * @param {number} length - Token length in bytes (default: 32)
 * @returns {string} - Hex-encoded random token
 */
function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString("hex");
}

/**
 * Encrypt a file stream
 * @param {string} inputPath - Path to input file
 * @param {string} outputPath - Path to output encrypted file
 * @returns {Promise<{iv: string, authTag: string}>}
 */
async function encryptFile(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const key = getKey();
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
      
      const input = fs.createReadStream(inputPath);
      const output = fs.createWriteStream(outputPath);
      
      // Write IV at the beginning of the file
      output.write(iv);
      
      input.pipe(cipher).pipe(output);
      
      output.on("finish", () => {
        const authTag = cipher.getAuthTag();
        // Append auth tag at the end
        fs.appendFileSync(outputPath, authTag);
        resolve({
          iv: iv.toString("hex"),
          authTag: authTag.toString("hex")
        });
      });
      
      output.on("error", reject);
      input.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Decrypt a file stream
 * @param {string} inputPath - Path to encrypted file
 * @param {string} outputPath - Path to output decrypted file
 * @returns {Promise<void>}
 */
async function decryptFile(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const key = getKey();
      const stats = fs.statSync(inputPath);
      const fileSize = stats.size;
      
      // Read IV from beginning and auth tag from end
      const fd = fs.openSync(inputPath, "r");
      const iv = Buffer.alloc(IV_LENGTH);
      fs.readSync(fd, iv, 0, IV_LENGTH, 0);
      
      const authTag = Buffer.alloc(AUTH_TAG_LENGTH);
      fs.readSync(fd, authTag, 0, AUTH_TAG_LENGTH, fileSize - AUTH_TAG_LENGTH);
      fs.closeSync(fd);
      
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      
      // Create read stream skipping IV, and we'll handle the auth tag separately
      const input = fs.createReadStream(inputPath, {
        start: IV_LENGTH,
        end: fileSize - AUTH_TAG_LENGTH - 1
      });
      const output = fs.createWriteStream(outputPath);
      
      input.pipe(decipher).pipe(output);
      
      output.on("finish", resolve);
      output.on("error", reject);
      input.on("error", reject);
      decipher.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Encrypt sensitive cookie value
 * @param {string} value - Cookie value to encrypt
 * @returns {string} - Encrypted cookie value
 */
function encryptCookie(value) {
  if (!value) return value;
  return encrypt(JSON.stringify({ v: value, t: Date.now() }));
}

/**
 * Decrypt sensitive cookie value
 * @param {string} encryptedValue - Encrypted cookie value
 * @param {number} maxAgeMs - Maximum age in milliseconds (default: 24 hours)
 * @returns {string|null} - Decrypted value or null if expired/invalid
 */
function decryptCookie(encryptedValue, maxAgeMs = 24 * 60 * 60 * 1000) {
  if (!encryptedValue) return null;
  try {
    const decrypted = decrypt(encryptedValue);
    const parsed = JSON.parse(decrypted);
    if (Date.now() - parsed.t > maxAgeMs) {
      return null; // Expired
    }
    return parsed.v;
  } catch {
    return null;
  }
}

// Encrypt sensitive fields in an object
function encryptFields(obj, fields) {
  if (!obj || !fields || !fields.length) return obj;
  const result = { ...obj };
  for (const field of fields) {
    if (result[field] && typeof result[field] === "string") {
      result[field] = encrypt(result[field]);
    }
  }
  return result;
}

// Decrypt sensitive fields in an object
function decryptFields(obj, fields) {
  if (!obj || !fields || !fields.length) return obj;
  const result = { ...obj };
  for (const field of fields) {
    if (result[field] && typeof result[field] === "string") {
      result[field] = decrypt(result[field]);
    }
  }
  return result;
}

module.exports = {
  encrypt,
  decrypt,
  hash,
  hashWithSalt,
  verifyHash,
  generateSecureToken,
  encryptFile,
  decryptFile,
  encryptCookie,
  decryptCookie,
  encryptFields,
  decryptFields,
  ALGORITHM
};
