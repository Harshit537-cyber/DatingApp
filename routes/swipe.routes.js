const express = require('express');
const router = express.Router();

const {
    superLikeUser
} = require('../controllers/swipe.controller');

const { protect } = require('../middleware/authMiddleware');


// Super Like API
router.post(
    '/super-like',
    protect,
    superLikeUser
);


module.exports = router;