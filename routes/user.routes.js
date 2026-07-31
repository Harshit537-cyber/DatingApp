const express = require('express');
const router = express.Router();
const { 
  registerUser,
  loginUser,
  getMe,
  updateProfile,
  deleteAccount,
  deactivateAccount,
  activateAccount,
  getProfileById,
  hideProfile,
  unhideProfile,
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

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.get('/profile/:id', protect, getProfileById);
router.delete('/account', protect, deleteAccount);
router.post('/deactivate', protect, deactivateAccount);
router.post('/activate', protect, activateAccount);
router.post('/hide', protect, hideProfile);
router.post('/unhide', protect, unhideProfile);

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