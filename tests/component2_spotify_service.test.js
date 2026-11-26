const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const mongoose = require("mongoose");

// Ensure environment variables are set for the test run
process.env.SPOTIFY_CLIENT_ID = "test_spotify_client_id_12345";
process.env.SPOTIFY_CLIENT_SECRET = "test_spotify_client_secret_67890";
process.env.SPOTIFY_REDIRECT_URI = "https://api.bummps.com/api/spotify/callback";
process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");

const {
  generateCodeVerifier,
  generateCodeChallenge,
  generateOAuthState,
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  fetchSpotifyProfile,
  getApplicationToken,
  resetAppTokenCache,
  refreshUserToken,
  getValidUserAccessToken,
  searchTracks,
} = require("../services/spotify.service");

const { encryptToken, decryptToken } = require("../utils/crypto.util");
const User = require("../models/user.model");

describe("Component 2: Spotify Service Layer", () => {
  beforeEach(() => {
    resetAppTokenCache();
  });

  describe("PKCE Generation & Authorization URL", () => {
    it("should generate a RFC 7636 compliant PKCE code verifier and challenge", () => {
      const verifier = generateCodeVerifier();
      assert.strictEqual(typeof verifier, "string");
      // Length must be between 43 and 128 characters
      assert.ok(verifier.length >= 43 && verifier.length <= 128);
      // Must be URL-safe (base64url characters only)
      assert.match(verifier, /^[A-Za-z0-9_-]+$/);

      const challenge = generateCodeChallenge(verifier);
      assert.strictEqual(typeof challenge, "string");
      assert.match(challenge, /^[A-Za-z0-9_-]+$/);

      // Deterministic: same verifier gives same challenge
      assert.strictEqual(generateCodeChallenge(verifier), challenge);

      // Different verifier gives different challenge
      const verifier2 = generateCodeVerifier();
      assert.notStrictEqual(verifier, verifier2);
      assert.notStrictEqual(challenge, generateCodeChallenge(verifier2));
    });

    it("should generate a 64-char hex state parameter for CSRF mitigation", () => {
      const state1 = generateOAuthState();
      const state2 = generateOAuthState();
      assert.strictEqual(state1.length, 64);
      assert.notStrictEqual(state1, state2);
    });

    it("should construct a valid Spotify authorization URL with PKCE parameters and scopes", () => {
      const state = generateOAuthState();
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);

      const authUrl = buildAuthorizationUrl({
        state,
        codeChallenge: challenge,
      });

      const parsed = new URL(authUrl);
      assert.strictEqual(parsed.origin, "https://accounts.spotify.com");
      assert.strictEqual(parsed.pathname, "/authorize");
      assert.strictEqual(parsed.searchParams.get("client_id"), process.env.SPOTIFY_CLIENT_ID);
      assert.strictEqual(parsed.searchParams.get("response_type"), "code");
      assert.strictEqual(parsed.searchParams.get("state"), state);
      assert.strictEqual(parsed.searchParams.get("code_challenge"), challenge);
      assert.strictEqual(parsed.searchParams.get("code_challenge_method"), "S256");

      const scopes = parsed.searchParams.get("scope").split(" ");
      assert.ok(scopes.includes("user-read-private"));
      assert.ok(scopes.includes("user-read-email"));
      assert.ok(scopes.includes("user-top-read"));
    });
  });

  describe("Client Credentials Application Token Cache", () => {
    it("should fetch and cache the client credentials token", async () => {
      let fetchCount = 0;
      const mockFetch = async (url, options) => {
        fetchCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: "mock_app_token_xyz_1",
            token_type: "Bearer",
            expires_in: 3600,
          }),
        };
      };

      const token1 = await getApplicationToken(mockFetch);
      assert.strictEqual(token1, "mock_app_token_xyz_1");
      assert.strictEqual(fetchCount, 1);

      // Second call should return the cached token without hitting mockFetch
      const token2 = await getApplicationToken(mockFetch);
      assert.strictEqual(token2, "mock_app_token_xyz_1");
      assert.strictEqual(fetchCount, 1); // No second HTTP call
    });

    it("should reuse in-flight promise for concurrent token requests", async () => {
      let fetchCount = 0;
      const mockFetch = async () => {
        fetchCount++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: "concurrent_app_token",
            expires_in: 3600,
          }),
        };
      };

      const [t1, t2, t3] = await Promise.all([
        getApplicationToken(mockFetch),
        getApplicationToken(mockFetch),
        getApplicationToken(mockFetch),
      ]);

      assert.strictEqual(t1, "concurrent_app_token");
      assert.strictEqual(t2, "concurrent_app_token");
      assert.strictEqual(t3, "concurrent_app_token");
      assert.strictEqual(fetchCount, 1);
    });
  });

  describe("Authorization Code Exchange & Profile Retrieval", () => {
    it("should exchange code + verifier for access and refresh tokens", async () => {
      const mockFetch = async (url, options) => {
        const body = options.body;
        assert.ok(body.includes("grant_type=authorization_code"));
        assert.ok(body.includes("code=test_auth_code"));
        assert.ok(body.includes("code_verifier=test_verifier"));

        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: "mock_user_access_token",
            refresh_token: "mock_user_refresh_token",
            expires_in: 3600,
            scope: "user-read-private user-read-email",
          }),
        };
      };

      const tokens = await exchangeAuthorizationCode({
        code: "test_auth_code",
        codeVerifier: "test_verifier",
        redirectUri: "https://api.bummps.com/api/spotify/callback",
        fetchImpl: mockFetch,
      });

      assert.strictEqual(tokens.accessToken, "mock_user_access_token");
      assert.strictEqual(tokens.refreshToken, "mock_user_refresh_token");
      assert.ok(tokens.tokenExpiresAt instanceof Date);
    });

    it("should fetch and normalize Spotify user profile", async () => {
      const mockFetch = async (url, options) => {
        assert.strictEqual(options.headers.Authorization, "Bearer mock_user_access_token");
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "spotify_user_999",
            display_name: "John Spotify",
            email: "john@example.com",
            external_urls: { spotify: "https://open.spotify.com/user/spotify_user_999" },
            images: [{ url: "https://example.com/avatar.jpg" }],
          }),
        };
      };

      const profile = await fetchSpotifyProfile("mock_user_access_token", mockFetch);
      assert.strictEqual(profile.id, "spotify_user_999");
      assert.strictEqual(profile.displayName, "John Spotify");
      assert.strictEqual(profile.email, "john@example.com");
      assert.strictEqual(profile.profileUrl, "https://open.spotify.com/user/spotify_user_999");
      assert.strictEqual(profile.imageUrl, "https://example.com/avatar.jpg");
    });
  });

  describe("Token Refresh & Revocation Handling", () => {
    it("should handle revoked authorization (invalid_grant) by marking account disconnected", async () => {
      const dummyUserId = new mongoose.Types.ObjectId();

      // Mock User.findById and User.findByIdAndUpdate
      const originalFindById = User.findById;
      const originalFindByIdAndUpdate = User.findByIdAndUpdate;

      let updatedFields = null;
      User.findById = (id) => ({
        select: async () => ({
          _id: dummyUserId,
          spotify: {
            isConnected: true,
            refreshToken: encryptToken("revoked_refresh_token"),
          },
        }),
      });

      User.findByIdAndUpdate = async (id, query) => {
        updatedFields = query.$set;
        return { _id: dummyUserId };
      };

      const mockFetch = async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          error: "invalid_grant",
          error_description: "Refresh token revoked",
        }),
      });

      try {
        await assert.rejects(
          async () => {
            await refreshUserToken(dummyUserId, mockFetch);
          },
          (err) => {
            assert.strictEqual(err.code, "REFRESH_REVOKED");
            assert.strictEqual(err.status, 401);
            return true;
          }
        );

        // Verify account is marked disconnected and wiped
        assert.strictEqual(updatedFields["spotify.isConnected"], false);
        assert.strictEqual(updatedFields["spotify.accessToken"], null);
        assert.strictEqual(updatedFields["spotify.refreshToken"], null);
      } finally {
        User.findById = originalFindById;
        User.findByIdAndUpdate = originalFindByIdAndUpdate;
      }
    });
  });

  describe("Spotify Song Search Proxy (Client Credentials)", () => {
    it("should reject an empty search query with status 400", async () => {
      await assert.rejects(
        async () => {
          await searchTracks({ query: "   " });
        },
        (err) => {
          assert.strictEqual(err.status, 400);
          assert.match(err.message, /cannot be empty/i);
          return true;
        }
      );
    });

    it("should clamp limits and return sanitized track metadata matching the contract", async () => {
      const mockFetch = async (url, options) => {
        // First call is client credentials token
        if (url.includes("/api/token")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              access_token: "mock_search_token",
              expires_in: 3600,
            }),
          };
        }

        // Second call is the search query
        assert.ok(url.includes("q=Starboy"));
        assert.ok(url.includes("limit=15"));

        return {
          ok: true,
          status: 200,
          json: async () => ({
            tracks: {
              items: [
                {
                  id: "4dH1jW6Z",
                  name: "Starboy",
                  artists: [{ name: "The Weeknd" }, { name: "Daft Punk" }],
                  album: {
                    name: "Starboy",
                    images: [{ url: "https://example.com/starboy.jpg" }],
                  },
                  external_urls: { spotify: "https://open.spotify.com/track/4dH1jW6Z" },
                  uri: "spotify:track:4dH1jW6Z",
                },
              ],
              total: 1,
            },
          }),
        };
      };

      const result = await searchTracks({
        query: "Starboy",
        limit: 15,
        fetchImpl: mockFetch,
      });

      assert.strictEqual(result.tracks.length, 1);
      const track = result.tracks[0];

      // Exact contract verification
      assert.strictEqual(track.id, "4dH1jW6Z");
      assert.strictEqual(track.name, "Starboy");
      assert.strictEqual(track.artist, "The Weeknd, Daft Punk");
      assert.strictEqual(track.albumName, "Starboy");
      assert.strictEqual(track.albumArtUrl, "https://example.com/starboy.jpg");
      assert.strictEqual(track.spotifyUrl, "https://open.spotify.com/track/4dH1jW6Z");
      assert.strictEqual(track.uri, "spotify:track:4dH1jW6Z");
    });

    it("should handle Spotify HTTP 429 rate limit with Retry-After header", async () => {
      const mockFetch = async (url) => {
        if (url.includes("/api/token")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ access_token: "mock_token", expires_in: 3600 }),
          };
        }

        return {
          ok: false,
          status: 429,
          headers: new Map([["Retry-After", "10"]]),
          json: async () => ({ error: { message: "API rate limit exceeded" } }),
        };
      };

      await assert.rejects(
        async () => {
          await searchTracks({
            query: "Too Fast",
            fetchImpl: mockFetch,
          });
        },
        (err) => {
          assert.strictEqual(err.status, 429);
          assert.strictEqual(err.retryAfter, "10");
          assert.match(err.message, /rate limit reached/i);
          return true;
        }
      );
    });
  });
});
