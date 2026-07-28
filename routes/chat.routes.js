const express = require('express');

const router = express.Router();


const {
sendMessage,
getMyChats,
getMessages,
markRead
} = require('../controllers/chat.controller');


const protect = require('../middleware/authmiddleware');



// Send message
router.post(
'/send',
protect,
sendMessage
);



// Get chats
router.get(
'/my-chats',
protect,
getMyChats
);



// Get messages
router.get(
'/:chatId/messages',
protect,
getMessages
);



// Read messages
router.patch(
'/:chatId/read',
protect,
markRead
);



module.exports = router;