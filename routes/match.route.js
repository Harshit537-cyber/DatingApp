const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { checkSubscription } = require("../middleware/checkSubscription"); 
const {
  getSwipeProfiles,
  filterProfiles,
  likeProfile,
  passProfile,
  rewindLastAction,
  getMatches,
  getNewMatches,
  getWhoLikedMe,
  getWhoLikedMeFiltered,
  searchLikes,
  activateBoost
} = require("../controllers/match.controller");

router.get("/feed", protect, checkSubscription, getSwipeProfiles);
router.post("/filter", protect, checkSubscription, filterProfiles);
router.post("/like", protect, checkSubscription, likeProfile);
router.post("/pass", protect, checkSubscription, passProfile);
router.post("/rewind", protect, checkSubscription, rewindLastAction);
router.get("/my-matches", protect, checkSubscription, getMatches);
router.get("/new-matches", protect, checkSubscription, getNewMatches);

router.get("/who-liked-me", protect, checkSubscription, getWhoLikedMe);
router.get("/who-liked-me/filter", protect, checkSubscription, getWhoLikedMeFiltered);
router.get("/search-likes", protect, checkSubscription, searchLikes);

router.post("/boost", protect, checkSubscription, activateBoost);

module.exports = router;