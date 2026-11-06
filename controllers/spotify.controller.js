const crypto = require("crypto");
const User = require("../models/user.model");

const SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_URL = "https://api.spotify.com/v1";
// Added "user-read-playback-state" for currently playing track
const SPOTIFY_SCOPES = ["user-read-private", "user-read-email", "user-read-playback-state"];
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const getSpotifyConfig = () => {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI } =
    process.env;

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REDIRECT_URI) {
    throw new Error(
      "SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI must be configured"
    );
  }

  return {
    clientId: SPOTIFY_CLIENT_ID,
    clientSecret: SPOTIFY_CLIENT_SECRET,
    redirectUri: SPOTIFY_REDIRECT_URI,
  };
};

const requestSpotifyToken = async (formData) => {
  const { clientId, clientSecret } = getSpotifyConfig();
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(formData),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`Spotify token request failed (${response.status})`);
  }

  if (!payload.access_token || !Number.isFinite(payload.expires_in)) {
    throw new Error("Spotify returned an invalid token response");
  }

  return payload;
};

const requestSpotifyProfile = async (accessToken) => {
  const response = await fetch(`${SPOTIFY_API_URL}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`Spotify profile request failed (${response.status})`);
  }

  return payload;
};

const toPublicSpotifyProfile = (profile) => ({
  id: profile.id,
  displayName: profile.display_name || "",
  email: profile.email || "",
  profileUrl: profile.external_urls?.spotify || "",
  imageUrl: profile.images?.[0]?.url || "",
});

const connectSpotify = async (req, res) => {
  try {
    const { clientId, redirectUri } = getSpotifyConfig();
    const state = crypto.randomBytes(32).toString("hex");
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          "spotify.oauthState": state,
          "spotify.oauthStateExpiresAt": new Date(Date.now() + OAUTH_STATE_TTL_MS),
        },
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const authorizationUrl = new URL(SPOTIFY_AUTHORIZE_URL);
    authorizationUrl.search = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: SPOTIFY_SCOPES.join(" "),
      state,
    }).toString();

    return res.status(200).json({
      success: true,
      data: { authorizationUrl: authorizationUrl.toString() },
    });
  } catch (error) {
    console.error("[Spotify] Could not start authorization:", error.message);
    return res.status(500).json({
      success: false,
      message: "Could not start Spotify authorization",
    });
  }
};

const handleSpotifyCallback = async (req, res) => {
  try {
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!state) {
      return res.status(400).json({ success: false, message: "Invalid OAuth state" });
    }

    const user = await User.findOneAndUpdate(
      {
        "spotify.oauthState": state,
        "spotify.oauthStateExpiresAt": { $gt: new Date() },
      },
      {
        $unset: {
          "spotify.oauthState": 1,
          "spotify.oauthStateExpiresAt": 1,
        },
      },
      { new: true }
    );

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Spotify authorization expired or state is invalid",
      });
    }

    if (typeof req.query.error === "string") {
      return res.status(400).json({
        success: false,
        message: "Spotify authorization was declined",
      });
    }

    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Spotify authorization code is required",
      });
    }

    const { redirectUri } = getSpotifyConfig();
    const token = await requestSpotifyToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    const profile = await requestSpotifyProfile(token.access_token);
    const spotifyProfile = toPublicSpotifyProfile(profile);

    await User.findByIdAndUpdate(user._id, {
      $set: {
        "spotify.spotifyUserId": spotifyProfile.id,
        "spotify.displayName": spotifyProfile.displayName,
        "spotify.email": spotifyProfile.email,
        "spotify.profileUrl": spotifyProfile.profileUrl,
        "spotify.imageUrl": spotifyProfile.imageUrl,
        "spotify.accessToken": token.access_token,
        "spotify.refreshToken": token.refresh_token,
        "spotify.expiresAt": new Date(Date.now() + token.expires_in * 1000),
      },
    });

    return res.status(200).json({
      success: true,
      message: "Spotify account connected",
      data: spotifyProfile,
    });
  } catch (error) {
    console.error("[Spotify] Authorization callback failed:", error.message);
    return res.status(502).json({
      success: false,
      message: "Spotify authorization could not be completed",
    });
  }
};

const getSpotifyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "+spotify.accessToken +spotify.refreshToken"
    );

    if (!user?.spotify?.spotifyUserId || !user.spotify.refreshToken) {
      return res.status(404).json({
        success: false,
        message: "Spotify account is not connected",
      });
    }

    let accessToken = user.spotify.accessToken;
    if (!accessToken || user.spotify.expiresAt <= new Date(Date.now() + 60_000)) {
      const refreshedToken = await requestSpotifyToken({
        grant_type: "refresh_token",
        refresh_token: user.spotify.refreshToken,
      });
      accessToken = refreshedToken.access_token;

      await User.findByIdAndUpdate(user._id, {
        $set: {
          "spotify.accessToken": accessToken,
          "spotify.expiresAt": new Date(
            Date.now() + refreshedToken.expires_in * 1000
          ),
          ...(refreshedToken.refresh_token
            ? { "spotify.refreshToken": refreshedToken.refresh_token }
            : {}),
        },
      });
    }

    const profile = await requestSpotifyProfile(accessToken);
    const spotifyProfile = toPublicSpotifyProfile(profile);
    await User.findByIdAndUpdate(user._id, {
      $set: {
        "spotify.spotifyUserId": spotifyProfile.id,
        "spotify.displayName": spotifyProfile.displayName,
        "spotify.email": spotifyProfile.email,
        "spotify.profileUrl": spotifyProfile.profileUrl,
        "spotify.imageUrl": spotifyProfile.imageUrl,
      },
    });

    return res.status(200).json({ success: true, data: spotifyProfile });
  } catch (error) {
    console.error("[Spotify] Could not fetch profile:", error.message);
    return res.status(502).json({
      success: false,
      message: "Could not fetch Spotify profile",
    });
  }
};


const getCurrentlyPlaying = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "+spotify.accessToken +spotify.refreshToken"
    );

    if (!user?.spotify?.spotifyUserId || !user.spotify.refreshToken) {
      return res.status(404).json({
        success: false,
        message: "Spotify account is not connected",
      });
    }

    let accessToken = user.spotify.accessToken;
    if (!accessToken || user.spotify.expiresAt <= new Date(Date.now() + 60_000)) {
      const refreshedToken = await requestSpotifyToken({
        grant_type: "refresh_token",
        refresh_token: user.spotify.refreshToken,
      });
      accessToken = refreshedToken.access_token;

      await User.findByIdAndUpdate(user._id, {
        $set: {
          "spotify.accessToken": accessToken,
          "spotify.expiresAt": new Date(
            Date.now() + refreshedToken.expires_in * 1000
          ),
          ...(refreshedToken.refresh_token
            ? { "spotify.refreshToken": refreshedToken.refresh_token }
            : {}),
        },
      });
    }

    const response = await fetch(`${SPOTIFY_API_URL}/me/player/currently-playing`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // Agar user kuch nahi sun raha toh Spotify 204 (No Content) status bhejta hai
    if (response.status === 204 || response.status === 205) {
      return res.status(200).json({
        success: true,
        data: { isPlaying: false, track: null },
      });
    }

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(`Spotify currently-playing request failed (${response.status})`);
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
    console.error("[Spotify] Could not fetch currently playing track:", error.message);
    return res.status(502).json({
      success: false,
      message: "Could not fetch currently playing track",
    });
  }
};

const disconnectSpotify = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $unset: { spotify: 1 },
    });

    return res.status(200).json({
      success: true,
      message: "Spotify account disconnected",
    });
  } catch (error) {
    console.error("[Spotify] Could not disconnect account:", error.message);
    return res.status(500).json({
      success: false,
      message: "Could not disconnect Spotify account",
    });
  }
};

module.exports = {
  connectSpotify,
  handleSpotifyCallback,
  getSpotifyProfile,
  getCurrentlyPlaying, 
  disconnectSpotify,
};