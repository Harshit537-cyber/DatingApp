const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");
const {
  getInbox,
  getChatHistory,
  getNewMatches,
} = require("../controllers/chat.controller");

router.get("/inbox", protect, getInbox);
router.get("/history/:chatId", protect, getChatHistory);
router.get("/matches", protect, getNewMatches);

module.exports = router;