const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploadMiddleware');
const { protect } = require('../middleware/authMiddleware');
const { requireVerifiedHost } = require('../middleware/hostMiddleware');
const { applyToHost, getHostStatus } = require('../controllers/host.controller');
const { createHostEvent, getHostEvents } = require('../controllers/event.host.controller');

router.post('/apply', protect, applyToHost);
router.get('/status', protect, getHostStatus);
router.post('/events', protect, requireVerifiedHost, upload.single('image'), createHostEvent);
router.get('/events', protect, requireVerifiedHost, getHostEvents);

module.exports = router;