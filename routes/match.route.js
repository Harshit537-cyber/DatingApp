const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const {
  getSwipeProfiles,
  filterProfiles,
  likeProfile,
  passProfile,
  rewindLastAction,
  getMatches,
  getNewMatches,
} = require("../controllers/match.controller");

router.get("/feed", protect, getSwipeProfiles);
router.post("/filter", protect, filterProfiles);
router.post("/like", protect, likeProfile);
router.post("/pass", protect, passProfile);
router.post("/rewind", protect, rewindLastAction);
router.get("/my-matches", protect, getMatches);
router.get("/new-matches", protect, getNewMatches);

module.exports = router;