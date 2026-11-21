const crypto = require("crypto");
const { encryptToken, decryptToken } = require("../utils/crypto.util");
const User = require("../models/user.model");

const SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_URL = "https://api.spotify.com/v1";

const SPOTIFY_SCOPES = [
  "user-read-private",
  "user-read-email",
  "user-top-read",
];

const DEFAULT_HTTP_TIMEOUT_MS = 8000;

// In-memory cache for Client Credentials application token
let cachedAppToken = null;
let appTokenExpiresAt = 0;
let inFlightAppTokenPromise = null;

// Per-user token refresh mutex to prevent duplicate simultaneous refresh requests
const inFlightUserRefreshes = new Map();

/**
 * Validates that essential Spotify credentials are configured in the environment.
 */
function getSpotifyCredentials() {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI } =
    process.env;

  if (!SPOTIFY_CLIENT_ID) {
    throw new Error("SPOTIFY_CLIENT_ID must be configured in environment");
  }

  return {
    clientId: SPOTIFY_CLIENT_ID,
    clientSecret: SPOTIFY_CLIENT_SECRET || "",
    redirectUri: SPOTIFY_REDIRECT_URI || "https://api.bummps.com/api/spotify/callback",
  };
}

/**
 * Generates a PKCE code verifier (high-entropy random string, base64url encoded).
 */
function generateCodeVerifier() {
  // 64 random bytes -> 86 base64url characters (valid RFC 7636 length: 43-128 chars)
  return crypto.randomBytes(64).toString("base64url");
}

/**
 * Generates an S256 PKCE code challenge from a code verifier.
 */
function generateCodeChallenge(codeVerifier) {
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
}

/**
 * Generates a cryptographically secure random state parameter for CSRF mitigation.
 */
function generateOAuthState() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Constructs the Spotify authorization URL with PKCE parameters and required scopes.
 */
function buildAuthorizationUrl({ state, codeChallenge, redirectUri }) {
  const { clientId, redirectUri: defaultRedirectUri } = getSpotifyCredentials();
  const targetRedirect = redirectUri || defaultRedirectUri;

  const url = new URL(SPOTIFY_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SPOTIFY_SCOPES.join(" "),
    redirect_uri: targetRedirect,
    state,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
  }).toString();

  return url.toString();
}

/**
 * Helper to make HTTP requests with a timeout using AbortController.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_HTTP_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response;
  } catch (error) {
    clearTimeout(timer);
    if (error.name === "AbortError") {
      throw new Error(`Spotify API request timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Exchanges an OAuth 2.0 PKCE authorization code for Spotify access & refresh tokens.
 */
async function exchangeAuthorizationCode({ code, codeVerifier, redirectUri, fetchImpl = fetchWithTimeout }) {
  const { clientId, clientSecret, redirectUri: defaultRedirectUri } = getSpotifyCredentials();
  const targetRedirect = redirectUri || defaultRedirectUri;

  const bodyParams = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: targetRedirect,
    client_id: clientId,
    code_verifier: codeVerifier,
  });

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  // If clientSecret is configured, pass Basic auth header as supported by Spotify
  if (clientSecret) {
    headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  }

  const response = await fetchImpl(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers,
    body: bodyParams.toString(),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorDescription = data.error_description || data.error || `HTTP ${response.status}`;
    const err = new Error(`Spotify token exchange failed: ${errorDescription}`);
    err.status = response.status;
    err.spotifyError = data;
    throw err;
  }

  if (!data.access_token || !Number.isFinite(data.expires_in)) {
    throw new Error("Spotify returned an invalid token response");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope,
  };
}

/**
 * Fetches the user profile from Spotify's /v1/me endpoint.
 */
async function fetchSpotifyProfile(accessToken, fetchImpl = fetchWithTimeout) {
  const response = await fetchImpl(`${SPOTIFY_API_URL}/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorDetails = typeof data === "object" ? JSON.stringify(data) : String(data);
    const err = new Error(`Spotify profile request failed: ${response.status} - ${errorDetails}`);
    err.status = response.status;
    err.details = data;
    throw err;
  }

  return {
    id: data.id,
    displayName: data.display_name || "",
    email: data.email || "",
    profileUrl: data.external_urls?.spotify || "",
    imageUrl: data.images?.[0]?.url || "",
  };
}

/**
 * Retrieves a Client Credentials application token with in-memory caching.
 */
async function getApplicationToken(fetchImpl = fetchWithTimeout) {
  // If we have a cached token with at least 60 seconds validity remaining, reuse it
  const now = Date.now();
  if (cachedAppToken && appTokenExpiresAt > now + 60_000) {
    return cachedAppToken;
  }

  // Prevent multiple simultaneous token requests
  if (inFlightAppTokenPromise) {
    return inFlightAppTokenPromise;
  }

  inFlightAppTokenPromise = (async () => {
    try {
      const { clientId, clientSecret } = getSpotifyCredentials();
      if (!clientSecret) {
        throw new Error("SPOTIFY_CLIENT_SECRET is required for Client Credentials flow");
      }

      const response = await fetchImpl(SPOTIFY_TOKEN_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
        }).toString(),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.access_token) {
        throw new Error(
          `Spotify client credentials request failed: ${data.error_description || response.status}`
        );
      }

      cachedAppToken = data.access_token;
      appTokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
      return cachedAppToken;
    } finally {
      inFlightAppTokenPromise = null;
    }
  })();

  return inFlightAppTokenPromise;
}

/**
 * Resets the in-memory application token cache (useful for testing or key rotation).
 */
function resetAppTokenCache() {
  cachedAppToken = null;
  appTokenExpiresAt = 0;
  inFlightAppTokenPromise = null;
}

/**
 * Refreshes an expired or expiring access token for a given user.
 * Thread-safe: wraps concurrent refresh requests for the same user into a single promise.
 */
async function refreshUserToken(userId, fetchImpl = fetchWithTimeout) {
  const userIdStr = String(userId);

  // Return existing in-flight refresh promise if one is already pending for this user
  if (inFlightUserRefreshes.has(userIdStr)) {
    return inFlightUserRefreshes.get(userIdStr);
  }

  const refreshPromise = (async () => {
    try {
      const user = await User.findById(userId).select(
        "+spotify.accessToken +spotify.refreshToken +spotify.email"
      );

      if (!user || !user.spotify?.refreshToken) {
        const err = new Error("Spotify account is not connected or missing refresh token");
        err.code = "NOT_CONNECTED";
        throw err;
      }

      // Decrypt stored refresh token
      let rawRefreshToken;
      try {
        rawRefreshToken = decryptToken(user.spotify.refreshToken);
      } catch (e) {
        const err = new Error("Failed to decrypt stored Spotify refresh token");
        err.code = "DECRYPTION_FAILED";
        throw err;
      }

      const { clientId, clientSecret } = getSpotifyCredentials();
      const bodyParams = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: rawRefreshToken,
        client_id: clientId,
      });

      const headers = {
        "Content-Type": "application/x-www-form-urlencoded",
      };

      if (clientSecret) {
        headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
      }

      const response = await fetchImpl(SPOTIFY_TOKEN_URL, {
        method: "POST",
        headers,
        body: bodyParams.toString(),
      });

      const data = await response.json().catch(() => ({}));

      // Handle revoked or invalid refresh token
      if (!response.ok) {
        if (data.error === "invalid_grant" || response.status === 400 || response.status === 401) {
          // Mark account as disconnected to prevent infinite failing refresh loops
          await User.findByIdAndUpdate(userId, {
            $set: {
              "spotify.isConnected": false,
              "spotify.accessToken": null,
              "spotify.refreshToken": null,
              "spotify.tokenExpiresAt": null,
            },
          });

          const err = new Error("Spotify authorization was revoked by the user");
          err.code = "REFRESH_REVOKED";
          err.status = 401;
          throw err;
        }

        const err = new Error(`Spotify token refresh failed: ${data.error_description || response.status}`);
        err.status = response.status;
        throw err;
      }

      // Encrypt new tokens before persisting
      const encryptedAccessToken = encryptToken(data.access_token);
      const updates = {
        "spotify.isConnected": true,
        "spotify.accessToken": encryptedAccessToken,
        "spotify.tokenExpiresAt": new Date(Date.now() + data.expires_in * 1000),
        "spotify.expiresAt": new Date(Date.now() + data.expires_in * 1000), // backward compat
      };

      // Spotify rotates refresh tokens under PKCE; update if new one returned
      if (data.refresh_token) {
        updates["spotify.refreshToken"] = encryptToken(data.refresh_token);
      }

      await User.findByIdAndUpdate(userId, { $set: updates });

      return {
        accessToken: data.access_token,
        tokenExpiresAt: updates["spotify.tokenExpiresAt"],
      };
    } finally {
      inFlightUserRefreshes.delete(userIdStr);
    }
  })();

  inFlightUserRefreshes.set(userIdStr, refreshPromise);
  return refreshPromise;
}

/**
 * Gets a valid decrypted access token for a user, automatically refreshing if expired or expiring.
 */
async function getValidUserAccessToken(userId, fetchImpl = fetchWithTimeout) {
  const user = await User.findById(userId).select("+spotify.accessToken +spotify.refreshToken");

  if (!user || !user.spotify?.isConnected || !user.spotify?.refreshToken) {
    const err = new Error("Spotify account is not connected");
    err.code = "NOT_CONNECTED";
    throw err;
  }

  const tokenExpiresAt = user.spotify.tokenExpiresAt || user.spotify.expiresAt;
  const isExpiredOrExpiringSoon = !tokenExpiresAt || new Date(tokenExpiresAt).getTime() <= Date.now() + 60_000;

  if (isExpiredOrExpiringSoon) {
    const refreshed = await refreshUserToken(userId, fetchImpl);
    return refreshed.accessToken;
  }

  // Stored access token is still valid; decrypt and return
  return decryptToken(user.spotify.accessToken);
}

/**
 * Searches Spotify tracks using the Client Credentials flow.
 * Works even when the requesting Bummps user has not connected a Spotify account.
 */
async function searchTracks({ query, type = "track", limit = 15, offset = 0, fetchImpl = fetchWithTimeout }) {
  const sanitizedQuery = typeof query === "string" ? query.trim() : "";
  if (!sanitizedQuery) {
    const err = new Error("Search query 'q' cannot be empty");
    err.status = 400;
    throw err;
  }

  const parsedLimit = Math.max(1, Math.min(Number(limit) || 15, 50));
  const parsedOffset = Math.max(0, Number(offset) || 0);

  const appToken = await getApplicationToken(fetchImpl);

  const searchUrl = new URL(`${SPOTIFY_API_URL}/search`);
  searchUrl.search = new URLSearchParams({
    q: sanitizedQuery,
    type: type || "track",
    limit: String(parsedLimit),
    offset: String(parsedOffset),
  }).toString();

  const response = await fetchImpl(searchUrl.toString(), {
    headers: {
      Authorization: `Bearer ${appToken}`,
    },
  });

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After") || "5";
    const err = new Error(`Spotify search rate limit reached. Please retry after ${retryAfter} seconds`);
    err.status = 429;
    err.retryAfter = retryAfter;
    throw err;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(`Spotify track search failed: ${data.error?.message || response.status}`);
    err.status = response.status;
    throw err;
  }

  const rawTracks = data.tracks?.items || [];

  // Sanitize and normalize track metadata to exact contract
  const sanitizedTracks = rawTracks.map((item) => ({
    id: item.id,
    name: item.name,
    artist: Array.isArray(item.artists) ? item.artists.map((a) => a.name).join(", ") : "",
    albumName: item.album?.name || "",
    albumArtUrl: item.album?.images?.[0]?.url || "",
    spotifyUrl: item.external_urls?.spotify || "",
    uri: item.uri || `spotify:track:${item.id}`,
  }));

  return {
    tracks: sanitizedTracks,
    total: data.tracks?.total || sanitizedTracks.length,
    limit: parsedLimit,
    offset: parsedOffset,
  };
}

module.exports = {
  getSpotifyCredentials,
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
};
