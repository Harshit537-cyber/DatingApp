const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploadMiddleware');
const { registerUser, loginUser, deleteAccount, deactivateAccount} = require('../controllers/auth.controller');
const { protect } = require('../middleware/authMiddleware');
router.post('/register', upload.fields([
  { name: 'profilePic', maxCount: 1 },
  { name: 'additionalPhotos', maxCount: 5 }
]), registerUser);

router.post('/login', loginUser);
router.delete('/delete-account', protect, deleteAccount);
router.patch('/deactivate-account', protect, deactivateAccount);
module.exports = router;