const User = require("../models/user.model");
const SpotifyTransaction = require("../models/spotifyTransaction.model");
const { encryptToken } = require("../utils/crypto.util");
const spotifyService = require("../services/spotify.service");

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * GET /api/spotify/auth-url
 * Generates Spotify OAuth 2.0 PKCE Authorization URL.
 * Protected: Requires authenticated Bummps user via JWT.
 */
const getAuthUrl = async (req, res) => {
  try {
    const userId = req.user._id;

    // 1. Generate cryptographically secure state and PKCE verifier + challenge
    const state = spotifyService.generateOAuthState();
    const codeVerifier = spotifyService.generateCodeVerifier();
    const codeChallenge = spotifyService.generateCodeChallenge(codeVerifier);

    // Optional redirect URI override from query if client needs custom scheme
    const clientRedirectUri = req.query.redirectUri || process.env.SPOTIFY_REDIRECT_URI;

    // 2. Persist temporary OAuth transaction with automatic TTL cleanup
    await SpotifyTransaction.create({
      userId,
      state,
      codeVerifier,
      redirectUri: clientRedirectUri,
      expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
    });

    // 3. Build authorization URL with S256 PKCE parameters
    const authUrl = spotifyService.buildAuthorizationUrl({
      state,
      codeChallenge,
      redirectUri: clientRedirectUri,
    });

    return res.status(200).json({
      success: true,
      authUrl,
      data: { authUrl },
    });
  } catch (error) {
    console.error("[Spotify] Error generating authorization URL:", error.message);
    return res.status(500).json({
      success: false,
      message: "Could not generate Spotify authorization URL",
    });
  }
};

/**
 * POST & GET /api/spotify/callback
 * Handles Spotify authorization code exchange.
 * Supports both:
 *  - POST (Flutter in-app capture) with JSON body { code, state }
 *  - GET (Browser redirect) with query parameters ?code=...&state=...
 */
const handleCallback = async (req, res) => {
  try {
    const code = req.body?.code || req.query?.code;
    const state = req.body?.state || req.query?.state;
    const errorParam = req.query?.error || req.body?.error;

    // Handle user declining Spotify authorization
    if (errorParam) {
      if (req.method === "GET") {
        return res.redirect("bummps://spotify-callback?error=access_denied");
      }
      return res.status(400).json({
        success: false,
        message: "Spotify authorization was declined or cancelled",
      });
    }

    if (!state || typeof state !== "string") {
      return res.status(400).json({
        success: false,
        message: "Missing OAuth state parameter",
      });
    }

    if (!code || typeof code !== "string") {
      return res.status(400).json({
        success: false,
        message: "Missing Spotify authorization code",
      });
    }

    // 1. Atomically consume transaction (single-use, prevents replay attacks)
    const transaction = await SpotifyTransaction.consume(state);

    if (!transaction) {
      return res.status(400).json({
        success: false,
        message: "Invalid, expired, or already used OAuth state",
      });
    }

    // 2. Exchange authorization code & PKCE codeVerifier for tokens
    const tokens = await spotifyService.exchangeAuthorizationCode({
      code,
      codeVerifier: transaction.codeVerifier,
      redirectUri: transaction.redirectUri,
    });

    // 3. Retrieve authenticated Spotify user profile
    const profile = await spotifyService.fetchSpotifyProfile(tokens.accessToken);

    // 4. Duplicate Account Protection: Check if Spotify account is already linked to another user
    const existingUser = await User.findOne({
      "spotify.spotifyId": profile.id,
      _id: { $ne: transaction.userId },
      "spotify.isConnected": true,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "This Spotify account is already connected to another Bummps user",
      });
    }

    // 5. Encrypt credentials at rest using AES-256-GCM
    const encryptedAccessToken = encryptToken(tokens.accessToken);
    const encryptedRefreshToken = encryptToken(tokens.refreshToken);

    // 6. Persist Spotify connection details on initiating Bummps user
    const updatedUser = await User.findByIdAndUpdate(
      transaction.userId,
      {
        $set: {
          "spotify.isConnected": true,
          "spotify.spotifyId": profile.id,
          "spotify.displayName": profile.displayName,
          "spotify.email": profile.email,
          "spotify.profileUrl": profile.profileUrl,
          "spotify.imageUrl": profile.imageUrl,
          "spotify.accessToken": encryptedAccessToken,
          "spotify.refreshToken": encryptedRefreshToken,
          "spotify.tokenExpiresAt": tokens.tokenExpiresAt,
          // Backward-compatibility aliases
          "spotify.spotifyUserId": profile.id,
          "spotify.expiresAt": tokens.tokenExpiresAt,
        },
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const publicProfile = {
      isConnected: true,
      spotifyId: profile.id,
      displayName: profile.displayName,
      profileUrl: profile.profileUrl,
      imageUrl: profile.imageUrl,
    };

    // If browser GET redirect, display success page and try mobile deep-link
    if (req.method === "GET") {
      return res.status(200).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Spotify Connected</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; padding: 40px 20px; background: #121212; color: #fff; }
              .card { background: #181818; max-width: 420px; margin: 40px auto; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
              .icon { font-size: 52px; color: #1DB954; }
              h1 { font-size: 24px; margin: 16px 0 8px; }
              p { color: #b3b3b3; line-height: 1.5; }
              .name { color: #1DB954; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="icon">✓</div>
              <h1>Spotify Connected!</h1>
              <p>Successfully linked Spotify account <span class="name">${profile.displayName || profile.id}</span> to your Bummps profile.</p>
              <p>You can close this window and return to Postman or the Bummps App.</p>
            </div>
            <script>
              try { window.location.href = "bummps://spotify-callback?success=true&displayName=${encodeURIComponent(profile.displayName || profile.id)}"; } catch (e) {}
            </script>
          </body>
        </html>
      `);
    }

    // JSON response for mobile POST call
    return res.status(200).json({
      success: true,
      message: "Spotify account connected successfully",
      data: publicProfile,
    });
  } catch (error) {
    console.error("[Spotify] Callback handling failed:", error.message);
    const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 500;
    return res.status(status).json({
      success: false,
      message: error.message || "Could not complete Spotify authorization",
    });
  }
};

/**
 * POST /api/spotify/disconnect (also supports DELETE)
 * Unlinks the user's Spotify account and securely wipes stored credentials.
 * Protected: Requires authenticated Bummps user via JWT.
 */
const disconnectSpotify = async (req, res) => {
  try {
    const userId = req.user._id;

    await User.findByIdAndUpdate(userId, {
      $set: {
        "spotify.isConnected": false,
        "spotify.spotifyId": null,
        "spotify.displayName": null,
        "spotify.email": "",
        "spotify.profileUrl": "",
        "spotify.imageUrl": "",
        "spotify.accessToken": null,
        "spotify.refreshToken": null,
        "spotify.tokenExpiresAt": null,
        "spotify.spotifyUserId": null,
        "spotify.expiresAt": null,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Spotify account disconnected successfully",
    });
  } catch (error) {
    console.error("[Spotify] Disconnect failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Could not disconnect Spotify account",
    });
  }
};

/**
 * GET /api/spotify/status
 * Returns current user's Spotify connection status and public profile info.
 * Protected: Requires authenticated Bummps user via JWT.
 */
const getSpotifyStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const spotify = user.spotify || {};
    const isConnected = Boolean(spotify.isConnected && spotify.spotifyId);

    return res.status(200).json({
      success: true,
      data: {
        isConnected,
        spotifyId: isConnected ? spotify.spotifyId : null,
        displayName: isConnected ? spotify.displayName : null,
        profileUrl: isConnected ? spotify.profileUrl : "",
        imageUrl: isConnected ? spotify.imageUrl : "",
      },
    });
  } catch (error) {
    console.error("[Spotify] Status check failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Could not fetch Spotify connection status",
    });
  }
};

/**
 * GET /api/spotify/search
 * Server-side track search proxy using Client Credentials flow.
 * Works even if the user has not connected a Spotify account.
 */
const searchSpotifyTracks = async (req, res) => {
  try {
    const { q, type, limit, offset } = req.query;

    if (!q || !q.trim()) {
      return res.status(400).json({
        success: false,
        message: "Query parameter 'q' is required",
      });
    }

    const result = await spotifyService.searchTracks({
      query: q,
      type: type || "track",
      limit,
      offset,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("[Spotify] Search proxy error:", error.message);
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      message: error.message || "Failed to search Spotify tracks",
      ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
    });
  }
};

/**
 * GET /api/spotify/currently-playing
 * Preserves legacy endpoint using centralized token refresh manager.
 */
const getCurrentlyPlaying = async (req, res) => {
  try {
    const accessToken = await spotifyService.getValidUserAccessToken(req.user._id);

    const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 204 || response.status === 205) {
      return res.status(200).json({
        success: true,
        data: { isPlaying: false, track: null },
      });
    }

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: "Could not fetch currently playing track",
      });
    }

    if (!payload || !payload.item) {
      return res.status(200).json({
        success: true,
        data: { isPlaying: false, track: null },
      });
    }

    const trackData = {
      isPlaying: payload.is_playing,
      track: {
        id: payload.item.id,
        name: payload.item.name,
        artist: payload.item.artists?.map((artist) => artist.name).join(", "),
        album: payload.item.album?.name,
        imageUrl: payload.item.album?.images?.[0]?.url || "",
        durationMs: payload.item.duration_ms,
        progressMs: payload.progress_ms,
        externalUrl: payload.item.external_urls?.spotify || "",
      },
    };

    return res.status(200).json({ success: true, data: trackData });
  } catch (error) {
    if (error.code === "NOT_CONNECTED") {
      return res.status(404).json({
        success: false,
        message: "Spotify account is not connected",
      });
    }

    return res.status(502).json({
      success: false,
      message: error.message || "Could not fetch currently playing track",
    });
  }
};

module.exports = {
  getAuthUrl,
  handleCallback,
  disconnectSpotify,
  getSpotifyStatus,
  searchSpotifyTracks,
  getCurrentlyPlaying,
  // Backward compatibility alias exports
  connectSpotify: getAuthUrl,
  handleSpotifyCallback: handleCallback,
  getSpotifyProfile: getSpotifyStatus,
};
