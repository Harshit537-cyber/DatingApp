const express = require('express');
const router = express.Router();
const { 
  getFeedProfiles, 
  filterProfiles, 
  likeProfile, 
  getMatches 
} = require('../controllers/user.controller');
const { protect } = require('../middleware/authMiddleware');

router.get('/feed', protect, getFeedProfiles);
router.post('/filter', protect, filterProfiles);
router.post('/like', protect, likeProfile);
router.get('/matches', protect, getMatches);

module.exports = router;