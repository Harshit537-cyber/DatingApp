const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  getAuthUrl,
  handleCallback,
  disconnectSpotify,
  getSpotifyStatus,
  searchSpotifyTracks,
  getCurrentlyPlaying,
} = require("../controllers/spotify.controller");

// ============================================================
// Official Spotify Integration Endpoints (Specification Compliant)
// ============================================================

// 1. Generate Spotify OAuth 2.0 PKCE Authorization URL (Protected)
router.get("/auth-url", protect, getAuthUrl);

// 2. Exchange authorization code for tokens (Mobile POST or Browser GET)
router.post("/callback", handleCallback);
router.get("/callback", handleCallback);

// 3. Disconnect Spotify account and wipe stored credentials (Protected)
router.post("/disconnect", protect, disconnectSpotify);

// 4. Check current user's Spotify connection status (Protected)
router.get("/status", protect, getSpotifyStatus);

// 5. Public Search Proxy using Spotify Client Credentials Flow
router.get("/search", searchSpotifyTracks);

// ============================================================
// Backward Compatibility Route Aliases
// ============================================================
router.get("/connect", protect, getAuthUrl);
router.get("/profile", protect, getSpotifyStatus);
router.delete("/disconnect", protect, disconnectSpotify);
router.get("/currently-playing", protect, getCurrentlyPlaying);

module.exports = router;
