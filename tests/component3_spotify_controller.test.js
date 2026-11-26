const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const mongoose = require("mongoose");

process.env.JWT_SECRET = "test_jwt_secret_for_bummps_backend";
process.env.SPOTIFY_CLIENT_ID = "test_spotify_client_id_controller";
process.env.SPOTIFY_CLIENT_SECRET = "test_spotify_client_secret_controller";
process.env.SPOTIFY_REDIRECT_URI = "https://api.bummps.com/api/spotify/callback";
process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");

const User = require("../models/user.model");
const SpotifyTransaction = require("../models/spotifyTransaction.model");
const spotifyController = require("../controllers/spotify.controller");
const spotifyService = require("../services/spotify.service");
const { isEncrypted } = require("../utils/crypto.util");

describe("Component 3: Spotify Controller & Endpoints", () => {
  const dummyUserId = new mongoose.Types.ObjectId();
  const mockUser = {
    _id: dummyUserId,
    id: dummyUserId.toString(),
    name: "Alex Bummps",
    email: "alex@example.com",
    spotify: {
      isConnected: false,
    },
  };

  beforeEach(() => {
    spotifyService.resetAppTokenCache();
  });

  describe("GET /api/spotify/auth-url", () => {
    it("should generate a valid PKCE authorization URL and store a transaction", async () => {
      let createdTransaction = null;
      const originalCreate = SpotifyTransaction.create;
      SpotifyTransaction.create = async (doc) => {
        createdTransaction = doc;
        return doc;
      };

      try {
        const req = {
          user: mockUser,
          query: {},
        };

        let responseStatus = 0;
        let responseJson = null;
        const res = {
          status: (s) => {
            responseStatus = s;
            return {
              json: (j) => {
                responseJson = j;
              },
            };
          },
        };

        await spotifyController.getAuthUrl(req, res);

        assert.strictEqual(responseStatus, 200);
        assert.strictEqual(responseJson.success, true);
        assert.ok(responseJson.authUrl.includes("accounts.spotify.com/authorize"));
        assert.ok(responseJson.authUrl.includes("code_challenge="));
        assert.ok(responseJson.authUrl.includes("code_challenge_method=S256"));

        // Verify transaction storage
        assert.ok(createdTransaction);
        assert.strictEqual(createdTransaction.userId.toString(), dummyUserId.toString());
        assert.ok(createdTransaction.state);
        assert.ok(createdTransaction.codeVerifier);
        assert.ok(createdTransaction.expiresAt instanceof Date);
      } finally {
        SpotifyTransaction.create = originalCreate;
      }
    });
  });

  describe("POST /api/spotify/callback & Anti-Replay", () => {
    it("should reject a callback when state parameter is missing", async () => {
      const req = {
        body: { code: "valid_code" },
        query: {},
      };

      let status = 0;
      let json = null;
      const res = {
        status: (s) => {
          status = s;
          return { json: (j) => (json = j) };
        },
      };

      await spotifyController.handleCallback(req, res);
      assert.strictEqual(status, 400);
      assert.match(json.message, /Missing OAuth state/i);
    });

    it("should reject an invalid or non-existent state", async () => {
      const originalConsume = SpotifyTransaction.consume;
      SpotifyTransaction.consume = async () => null;

      try {
        const req = {
          body: { code: "valid_code", state: "non_existent_state" },
          query: {},
        };

        let status = 0;
        let json = null;
        const res = {
          status: (s) => {
            status = s;
            return { json: (j) => (json = j) };
          },
        };

        await spotifyController.handleCallback(req, res);
        assert.strictEqual(status, 400);
        assert.match(json.message, /Invalid, expired, or already used/i);
      } finally {
        SpotifyTransaction.consume = originalConsume;
      }
    });

    it("should reject replaying an already consumed state (Single-Use)", async () => {
      let consumedTimes = 0;
      const originalConsume = SpotifyTransaction.consume;
      // First call consumes state; subsequent call returns null (simulating single-use atomic consumption)
      SpotifyTransaction.consume = async (state) => {
        consumedTimes++;
        if (consumedTimes === 1) {
          return {
            userId: dummyUserId,
            state,
            codeVerifier: "mock_verifier",
            redirectUri: "https://api.bummps.com/api/spotify/callback",
          };
        }
        return null; // Already consumed
      };

      // Mock service exchange and user lookup
      const originalExchange = spotifyService.exchangeAuthorizationCode;
      const originalProfile = spotifyService.fetchSpotifyProfile;
      const originalFindOne = User.findOne;
      const originalFindByIdAndUpdate = User.findByIdAndUpdate;

      spotifyService.exchangeAuthorizationCode = async () => ({
        accessToken: "token_abc",
        refreshToken: "refresh_abc",
        tokenExpiresAt: new Date(Date.now() + 3600000),
      });

      spotifyService.fetchSpotifyProfile = async () => ({
        id: "spotify_alex_123",
        displayName: "Alex",
        email: "alex@example.com",
        profileUrl: "https://open.spotify.com/user/alex",
        imageUrl: "",
      });

      User.findOne = async () => null;
      User.findByIdAndUpdate = async () => ({ _id: dummyUserId });

      try {
        const state = "single_use_state_123";
        const req1 = { body: { code: "code_1", state }, query: {} };
        const req2 = { body: { code: "code_1", state }, query: {} };

        let status1 = 0, json1 = null;
        const res1 = { status: (s) => { status1 = s; return { json: (j) => (json1 = j) }; } };
        let status2 = 0, json2 = null;
        const res2 = { status: (s) => { status2 = s; return { json: (j) => (json2 = j) }; } };

        // First attempt succeeds
        await spotifyController.handleCallback(req1, res1);
        assert.strictEqual(status1, 200);
        assert.strictEqual(json1.success, true);

        // Replay attempt must be rejected!
        await spotifyController.handleCallback(req2, res2);
        assert.strictEqual(status2, 400);
        assert.match(json2.message, /already used/i);
      } finally {
        SpotifyTransaction.consume = originalConsume;
        spotifyService.exchangeAuthorizationCode = originalExchange;
        spotifyService.fetchSpotifyProfile = originalProfile;
        User.findOne = originalFindOne;
        User.findByIdAndUpdate = originalFindByIdAndUpdate;
      }
    });

    it("should link account, encrypt tokens at rest, and never expose tokens in response", async () => {
      let savedUserDoc = null;
      const originalConsume = SpotifyTransaction.consume;
      const originalExchange = spotifyService.exchangeAuthorizationCode;
      const originalProfile = spotifyService.fetchSpotifyProfile;
      const originalFindOne = User.findOne;
      const originalFindByIdAndUpdate = User.findByIdAndUpdate;

      SpotifyTransaction.consume = async () => ({
        userId: dummyUserId,
        state: "test_state",
        codeVerifier: "mock_verifier",
        redirectUri: "https://api.bummps.com/api/spotify/callback",
      });

      spotifyService.exchangeAuthorizationCode = async () => ({
        accessToken: "plain_access_token_123",
        refreshToken: "plain_refresh_token_456",
        tokenExpiresAt: new Date(Date.now() + 3600000),
      });

      spotifyService.fetchSpotifyProfile = async () => ({
        id: "spotify_alex_123",
        displayName: "Alex Music",
        email: "alex@example.com",
        profileUrl: "https://open.spotify.com/user/alex",
        imageUrl: "https://example.com/pic.jpg",
      });

      User.findOne = async () => null;
      User.findByIdAndUpdate = async (id, update) => {
        savedUserDoc = update.$set;
        return { _id: id, ...savedUserDoc };
      };

      try {
        const req = { body: { code: "mock_code", state: "mock_state" }, query: {} };
        let status = 0;
        let json = null;
        const res = { status: (s) => { status = s; return { json: (j) => (json = j) }; } };

        await spotifyController.handleCallback(req, res);

        assert.strictEqual(status, 200);
        assert.strictEqual(json.success, true);
        assert.strictEqual(json.data.isConnected, true);
        assert.strictEqual(json.data.spotifyId, "spotify_alex_123");
        assert.strictEqual(json.data.displayName, "Alex Music");

        // CRITICAL SECURITY ASSERTIONS:
        // 1. Tokens must NEVER be present in the HTTP API response
        assert.strictEqual(json.data.accessToken, undefined);
        assert.strictEqual(json.data.refreshToken, undefined);

        // 2. Tokens must be ENCRYPTED before writing to MongoDB
        assert.ok(savedUserDoc);
        assert.ok(isEncrypted(savedUserDoc["spotify.accessToken"]));
        assert.ok(isEncrypted(savedUserDoc["spotify.refreshToken"]));
        assert.notStrictEqual(savedUserDoc["spotify.accessToken"], "plain_access_token_123");
        assert.notStrictEqual(savedUserDoc["spotify.refreshToken"], "plain_refresh_token_456");
      } finally {
        SpotifyTransaction.consume = originalConsume;
        spotifyService.exchangeAuthorizationCode = originalExchange;
        spotifyService.fetchSpotifyProfile = originalProfile;
        User.findOne = originalFindOne;
        User.findByIdAndUpdate = originalFindByIdAndUpdate;
      }
    });

    it("should prevent duplicate Spotify account linking", async () => {
      const otherUserId = new mongoose.Types.ObjectId();
      const originalConsume = SpotifyTransaction.consume;
      const originalExchange = spotifyService.exchangeAuthorizationCode;
      const originalProfile = spotifyService.fetchSpotifyProfile;
      const originalFindOne = User.findOne;

      SpotifyTransaction.consume = async () => ({
        userId: dummyUserId,
        state: "dup_state",
        codeVerifier: "mock_verifier",
        redirectUri: "https://api.bummps.com/api/spotify/callback",
      });

      spotifyService.exchangeAuthorizationCode = async () => ({
        accessToken: "plain_token",
        refreshToken: "plain_refresh",
        tokenExpiresAt: new Date(Date.now() + 3600000),
      });

      spotifyService.fetchSpotifyProfile = async () => ({
        id: "already_linked_spotify_id",
        displayName: "Taken Account",
      });

      // Another user already has this Spotify account linked!
      User.findOne = async () => ({
        _id: otherUserId,
        spotify: { spotifyId: "already_linked_spotify_id", isConnected: true },
      });

      try {
        const req = { body: { code: "code", state: "dup_state" }, query: {} };
        let status = 0;
        let json = null;
        const res = { status: (s) => { status = s; return { json: (j) => (json = j) }; } };

        await spotifyController.handleCallback(req, res);

        assert.strictEqual(status, 409);
        assert.strictEqual(json.success, false);
        assert.match(json.message, /already connected to another Bummps user/i);
      } finally {
        SpotifyTransaction.consume = originalConsume;
        spotifyService.exchangeAuthorizationCode = originalExchange;
        spotifyService.fetchSpotifyProfile = originalProfile;
        User.findOne = originalFindOne;
      }
    });
  });

  describe("POST /api/spotify/disconnect", () => {
    it("should unlink account and wipe stored credentials", async () => {
      let updatedFields = null;
      const originalFindByIdAndUpdate = User.findByIdAndUpdate;
      User.findByIdAndUpdate = async (id, query) => {
        updatedFields = query.$set;
        return { _id: id };
      };

      try {
        const req = { user: mockUser };
        let status = 0;
        let json = null;
        const res = { status: (s) => { status = s; return { json: (j) => (json = j) }; } };

        await spotifyController.disconnectSpotify(req, res);

        assert.strictEqual(status, 200);
        assert.strictEqual(json.success, true);
        assert.strictEqual(updatedFields["spotify.isConnected"], false);
        assert.strictEqual(updatedFields["spotify.accessToken"], null);
        assert.strictEqual(updatedFields["spotify.refreshToken"], null);
        assert.strictEqual(updatedFields["spotify.spotifyId"], null);
      } finally {
        User.findByIdAndUpdate = originalFindByIdAndUpdate;
      }
    });
  });

  describe("GET /api/spotify/status", () => {
    it("should return connection status without exposing credentials", async () => {
      const originalFindById = User.findById;
      User.findById = async () => ({
        _id: dummyUserId,
        spotify: {
          isConnected: true,
          spotifyId: "spotify_user_777",
          displayName: "Connected Fan",
          profileUrl: "https://open.spotify.com/user/777",
          imageUrl: "https://example.com/avatar.png",
          accessToken: "encrypted_secret",
          refreshToken: "encrypted_refresh",
        },
      });

      try {
        const req = { user: mockUser };
        let status = 0;
        let json = null;
        const res = { status: (s) => { status = s; return { json: (j) => (json = j) }; } };

        await spotifyController.getSpotifyStatus(req, res);

        assert.strictEqual(status, 200);
        assert.strictEqual(json.data.isConnected, true);
        assert.strictEqual(json.data.displayName, "Connected Fan");
        assert.strictEqual(json.data.spotifyId, "spotify_user_777");

        // Never expose tokens
        assert.strictEqual(json.data.accessToken, undefined);
        assert.strictEqual(json.data.refreshToken, undefined);
      } finally {
        User.findById = originalFindById;
      }
    });
  });

  describe("GET /api/spotify/search Proxy", () => {
    it("should return search results using Client Credentials flow", async () => {
      const originalSearch = spotifyService.searchTracks;
      spotifyService.searchTracks = async ({ query, limit }) => ({
        tracks: [
          {
            id: "track_abc",
            name: "Blinding Lights",
            artist: "The Weeknd",
            albumName: "After Hours",
            albumArtUrl: "https://example.com/art.jpg",
            spotifyUrl: "https://open.spotify.com/track/track_abc",
            uri: "spotify:track:track_abc",
          },
        ],
        total: 1,
        limit: 15,
        offset: 0,
      });

      try {
        const req = { query: { q: "Blinding Lights" } };
        let status = 0;
        let json = null;
        const res = { status: (s) => { status = s; return { json: (j) => (json = j) }; } };

        await spotifyController.searchSpotifyTracks(req, res);

        assert.strictEqual(status, 200);
        assert.strictEqual(json.success, true);
        assert.strictEqual(json.data.tracks.length, 1);
        assert.strictEqual(json.data.tracks[0].name, "Blinding Lights");
      } finally {
        spotifyService.searchTracks = originalSearch;
      }
    });
  });
});
