const express = require('express');
const router = express.Router();

const {
  sendMessage,
  getMyChats,
  getMessages,
  markRead
} = require('../controllers/chat.controller');

const protect = require('../middleware/authMiddleware');

router.post('/send', protect, sendMessage);
router.get('/my-chats', protect, getMyChats);
router.get('/:chatId/messages', protect, getMessages);
router.patch('/:chatId/read', protect, markRead);

module.exports = router;