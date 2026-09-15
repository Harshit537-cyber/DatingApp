const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");
const {
  getInbox,
  getChatHistory,
  getNewMatches,
  accessChat,
  sendMessage,
  markAsRead,
  deleteChat,
} = require("../controllers/chat.controller");

router.get("/inbox", protect, getInbox);
router.get("/history/:chatId", protect, getChatHistory);
router.get("/matches", protect, getNewMatches);
router.post("/access/:recipientId", protect, accessChat);
router.post("/message", protect, sendMessage);
router.put("/read/:chatId", protect, markAsRead);
router.delete("/:chatId", protect, deleteChat);

module.exports = router;