const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  purchaseTicket,
  confirmTicketPurchase,
  getMyTickets,
  validateTicket,
} = require('../controllers/ticket.controller');

router.post('/purchase', protect, purchaseTicket);
router.post('/confirm', protect, confirmTicketPurchase);
router.get('/mine', protect, getMyTickets);
router.post('/validate', protect, validateTicket);

module.exports = router;