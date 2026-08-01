const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const {
  getSwipeProfiles,
  likeProfile,
  passProfile,
  rewindLastAction,
  getMatches,
} = require("../controllers/match.controller");

router.get("/feed", protect, getSwipeProfiles);
router.post("/like", protect, likeProfile);
router.post("/pass", protect, passProfile);
router.post("/rewind", protect, rewindLastAction);
router.get("/my-matches", protect, getMatches);

module.exports = router;