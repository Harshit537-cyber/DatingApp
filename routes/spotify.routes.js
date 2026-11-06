const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  connectSpotify,
  handleSpotifyCallback,
  getSpotifyProfile,
  disconnectSpotify,
} = require("../controllers/spotify.controller");

router.get("/connect", protect, connectSpotify);
router.get("/callback", handleSpotifyCallback);
router.get("/profile", protect, getSpotifyProfile);
router.delete("/disconnect", protect, disconnectSpotify);

module.exports = router;
