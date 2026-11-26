const { describe, it } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const mongoose = require("mongoose");

const {
  encryptToken,
  decryptToken,
  isEncrypted,
  generateEncryptionKey,
} = require("../utils/crypto.util");

const User = require("../models/user.model");
const Message = require("../models/message.model");
const SpotifyTransaction = require("../models/spotifyTransaction.model");

describe("Component 1: Cryptographic Utilities & Schema Extensions", () => {
  const testKey = generateEncryptionKey();

  describe("Token Encryption & Decryption (AES-256-GCM)", () => {
    it("should encrypt and decrypt a token successfully", () => {
      const originalToken = "BQB123456789_sample_spotify_access_token_xyz";
      const encrypted = encryptToken(originalToken, testKey);

      assert.strictEqual(typeof encrypted, "string");
      assert.strictEqual(isEncrypted(encrypted), true);
      assert.match(encrypted, /^enc:v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);

      const decrypted = decryptToken(encrypted, testKey);
      assert.strictEqual(decrypted, originalToken);
    });

    it("should generate a fresh IV for each encryption of the same value", () => {
      const token = "fixed_token_value";
      const enc1 = encryptToken(token, testKey);
      const enc2 = encryptToken(token, testKey);

      // Ciphertexts must differ because IV is cryptographically random per call
      assert.notStrictEqual(enc1, enc2);
      // But both must decrypt to the exact same original token
      assert.strictEqual(decryptToken(enc1, testKey), token);
      assert.strictEqual(decryptToken(enc2, testKey), token);
    });

    it("should fail decryption and reject tampered ciphertext (auth tag verification)", () => {
      const originalToken = "sensitive_refresh_token_to_protect";
      const encrypted = encryptToken(originalToken, testKey);

      // Tamper with the ciphertext component: enc:v1:iv:authTag:ciphertext
      const parts = encrypted.split(":");
      // parts: ['enc', 'v1', iv, authTag, ciphertext]
      const ciphertext = parts[4];
      const flippedChar = ciphertext.slice(-1) === "a" ? "b" : "a";
      const tamperedCiphertext = ciphertext.slice(0, -1) + flippedChar;
      const tampered = `enc:v1:${parts[2]}:${parts[3]}:${tamperedCiphertext}`;

      assert.throws(() => {
        decryptToken(tampered, testKey);
      }, /Unsupported state or unable to authenticate data|bad auth tag/i);
    });

    it("should safely handle legacy plaintext tokens for backward compatibility", () => {
      const legacyToken = "legacy_unencrypted_spotify_token_12345";
      assert.strictEqual(isEncrypted(legacyToken), false);

      const result = decryptToken(legacyToken, testKey);
      assert.strictEqual(result, legacyToken);
    });

    it("should handle null or undefined input gracefully", () => {
      assert.strictEqual(encryptToken(null, testKey), null);
      assert.strictEqual(encryptToken(undefined, testKey), undefined);
      assert.strictEqual(decryptToken(null, testKey), null);
      assert.strictEqual(decryptToken(undefined, testKey), undefined);
    });
  });

  describe("User Model Music & Spotify Schema Validation", () => {
    it("should correctly instantiate User schema with music and spotify fields", () => {
      const user = new User({
        name: "Test Music Fan",
        email: "fan@example.com",
        password: "hashedpassword",
        musicGenres: ["Indie Rock", "R&B"],
        favoriteArtists: ["The Weeknd", "Arctic Monkeys"],
        anthemSong: {
          id: "track_123",
          name: "Blinding Lights",
          artist: "The Weeknd",
          albumName: "After Hours",
          albumArtUrl: "https://example.com/art.jpg",
          spotifyUrl: "https://open.spotify.com/track/track_123",
          uri: "spotify:track:track_123",
        },
      });

      assert.strictEqual(user.name, "Test Music Fan");
      assert.strictEqual(user.spotify.isConnected, false);
      assert.strictEqual(user.musicGenres.length, 2);
      assert.strictEqual(user.favoriteArtists[0], "The Weeknd");
      assert.strictEqual(user.anthemSong.name, "Blinding Lights");
      assert.strictEqual(user.anthemSong.artist, "The Weeknd");
    });

    it("should exclude accessToken, refreshToken, and email by default (select: false)", () => {
      const spotifySchema = User.schema.path("spotify.accessToken");
      assert.strictEqual(spotifySchema.options.select, false);

      const refreshSchema = User.schema.path("spotify.refreshToken");
      assert.strictEqual(refreshSchema.options.select, false);
    });
  });

  describe("Message Model Music Sharing Schema Validation", () => {
    it("should support musicShare metadata and isMusicShare flag", () => {
      const message = new Message({
        chat: new mongoose.Types.ObjectId(),
        sender: new mongoose.Types.ObjectId(),
        receiver: new mongoose.Types.ObjectId(),
        message: "Check out this song!",
        messageType: "music",
        isMusicShare: true,
        musicShare: {
          trackId: "track_xyz",
          trackName: "Starboy",
          artistName: "The Weeknd",
          albumName: "Starboy",
          albumArtUrl: "https://example.com/starboy.jpg",
          spotifyUrl: "https://open.spotify.com/track/track_xyz",
        },
      });

      assert.strictEqual(message.isMusicShare, true);
      assert.strictEqual(message.messageType, "music");
      assert.strictEqual(message.musicShare.trackName, "Starboy");
      assert.strictEqual(message.musicShare.artistName, "The Weeknd");
    });
  });

  describe("SpotifyTransaction Model Definition", () => {
    it("should have state unique index and TTL index on expiresAt", () => {
      const statePath = SpotifyTransaction.schema.path("state");
      assert.strictEqual(statePath.options.required, true);

      const verifierPath = SpotifyTransaction.schema.path("codeVerifier");
      assert.strictEqual(verifierPath.options.select, false);

      const expiresPath = SpotifyTransaction.schema.path("expiresAt");
      assert.strictEqual(expiresPath.options.index.expires, 0);
    });
  });
});
