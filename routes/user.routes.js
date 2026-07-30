const express = require('express');
const router = express.Router();
const { 
  getFeedProfiles, 
  filterProfiles, 
  likeProfile, 
  getSentLikes,
  getMatches,
  getWhoLikedMe,
  blockUser,
  unblockUser,
  getBlockedUsers
} = require('../controllers/user.controller');
const protect = require('../middleware/authMiddleware');

router.get('/feed', protect, getFeedProfiles);
router.post('/filter', protect, filterProfiles);
router.post('/like', protect, likeProfile);

router.get('/sent-likes', protect, getSentLikes);
router.get('/matches', protect, getMatches);
router.get('/who-liked-me', protect, getWhoLikedMe);

router.post('/block', protect, blockUser);
router.post('/unblock', protect, unblockUser);
router.get('/blocked', protect, getBlockedUsers);

module.exports = router;