
const crypto = require("crypto");

// Generate a cryptographically secure 6-digit OTP
const generateOtp = () => {
  return crypto.randomInt(0, 1000000).toString().padStart(6, "0");
};

// Generate a SHA-256 hash of an OTP or reset token
const hashValue = (value) => {
  const secret = process.env.OTP_HASH_SECRET;

  if (!secret) {
    throw new Error("OTP_HASH_SECRET is not configured");
  }

  return crypto
    .createHmac("sha256", secret)
    .update(value)
    .digest("hex");
};

// Compare two hashes without ordinary string comparison
const compareHashes = (firstHash, secondHash) => {
  if (
    typeof firstHash !== "string" ||
    typeof secondHash !== "string" ||
    firstHash.length !== secondHash.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(firstHash, "hex"),
    Buffer.from(secondHash, "hex")
  );
};

module.exports = {
  generateOtp,
  hashValue,
  compareHashes,
};
