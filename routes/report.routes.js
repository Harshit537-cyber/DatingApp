const express = require('express');
const router = express.Router();

const { 
    reportSpamAccount,
    getMyReports
} = require('../controllers/report.controller');

const { protect } = require('../middleware/authMiddleware');


// Report account
router.post(
    '/report-spam',
    protect,
    reportSpamAccount
);


// Get my reported accounts
router.get(
    '/my-reports',
    protect,
    getMyReports
);


module.exports = router;