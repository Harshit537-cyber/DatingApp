const mongoose = require("mongoose");

/**
 * Spotify OAuth Transaction Model
 *
 * Stores short-lived OAuth 2.0 PKCE state parameters and code verifiers.
 * Features:
 *  - MongoDB TTL index: automatically purges transactions after expiration.
 *  - Atomic consumption via consume(): ensures state can only be used once (preventing replay attacks).
 *  - Supports multiple concurrent authorization attempts per user.
 */
const spotifyTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    state: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    codeVerifier: {
      type: String,
      required: true,
      select: false,
    },
    redirectUri: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // MongoDB TTL auto-cleanup
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Atomically consumes a state transaction.
 * Returns the matching transaction with codeVerifier, or null if invalid/expired/already used.
 */
spotifyTransactionSchema.statics.consume = async function (state) {
  if (!state || typeof state !== "string") return null;

  return this.findOneAndDelete({
    state,
    expiresAt: { $gt: new Date() },
  }).select("+codeVerifier");
};

module.exports = mongoose.model("SpotifyTransaction", spotifyTransactionSchema);
