const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploadMiddleware');
const { protect } = require('../middleware/authMiddleware');
const { requireVerifiedHost } = require('../middleware/hostMiddleware');

const {
  createApplicationFeeIntent,
  applyToHost,
  getHostStatus,
  createPayoutAccount,
  getPayoutStatus,
} = require('../controllers/host.controller');

const { createHostEvent, getHostEvents } = require('../controllers/event.host.controller');

// B7: Application fee intent
router.post('/application-fee/create-intent', protect, createApplicationFeeIntent);

// B1: Apply with Gov ID upload
router.post('/apply', protect, upload.single('govId'), applyToHost);

router.get('/status', protect, getHostStatus);

// Host Events
router.post('/events', protect, requireVerifiedHost, upload.single('image'), createHostEvent);
router.get('/events', protect, requireVerifiedHost, getHostEvents);

// B2: Stripe Connect Payout Routes
router.post('/payout/onboard', protect, requireVerifiedHost, createPayoutAccount);
router.get('/payout/status', protect, requireVerifiedHost, getPayoutStatus);

module.exports = router;