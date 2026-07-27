const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploadMiddleware');
const { registerUser, loginUser } = require('../controllers/auth.controller');

router.post('/register', upload.array('images', 5), registerUser);
router.post('/login', loginUser);

module.exports = router;