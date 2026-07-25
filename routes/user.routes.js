const express = require('express');
const router = express.Router();
const { 
  getFeedProfiles, 
  swipeUser, 
  getMatches, 
  updateProfile, 
  getProfile 
} = require('../controllers/user.controller');
const { protect } = require('../middleware/authMiddleware');

router.get('/feed', protect, getFeedProfiles);
router.post('/swipe', protect, swipeUser);
router.get('/matches', protect, getMatches);
router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);

module.exports = router;