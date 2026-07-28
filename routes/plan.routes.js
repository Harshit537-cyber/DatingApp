const express = require('express');
const router = express.Router();
const { getPlans, subscribePlan, getUserSubscription } = require('../controllers/plan.controller');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/', getPlans);
router.post('/subscribe', authMiddleware, subscribePlan);
router.get('/my-subscription', authMiddleware, getUserSubscription);

module.exports = router;