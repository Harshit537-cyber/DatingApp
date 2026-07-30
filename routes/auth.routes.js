const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploadMiddleware');
const { registerUser, loginUser, deleteAccount, updateProfile,getMe,deactivateAccount, activateAccount, getProfileById, hideProfile, unhideProfile} = require('../controllers/auth.controller');
const protect = require('../middleware/authMiddleware');
router.post('/register', upload.fields([
  { name: 'profilePic', maxCount: 1 },
  { name: 'additionalPhotos', maxCount: 5 }
]), registerUser);

router.post('/login', loginUser);
router.get('/profile/:id', protect, getProfileById);
router.delete('/delete-account', protect, deleteAccount);
router.patch('/deactivate-account', protect, deactivateAccount);
router.patch('/activate-account', protect, activateAccount);
router.patch('/hide-profile',protect,hideProfile);
router.patch('/unhide-profile',protect,unhideProfile);

router.get('/me', protect, getMe);
router.put('/update-profile', protect, upload.fields([
  { name: 'profilePic', maxCount: 1 },
  { name: 'additionalPhotos', maxCount: 5 }
]), updateProfile);

module.exports = router;