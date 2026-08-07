const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const {
  getUserNotifications,
  clearUserNotifications,
} = require("../controllers/notification.controller");

router.get("/", protect, getUserNotifications);
router.delete("/clear", protect, clearUserNotifications);

module.exports = router;