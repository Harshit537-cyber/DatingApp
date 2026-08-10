const express = require("express");
const router = express.Router();
const { protect }= require("../middleware/authMiddleware");
const {
  sendNotificationToAll,
  sendNotificationToSingleUser,
  getAdminSentNotifications,
} = require("../controllers/notification.controller");

router.post("/send-all", protect, sendNotificationToAll);
router.post("/send-single", protect, sendNotificationToSingleUser);
router.get("/sent-history", protect, getAdminSentNotifications);

module.exports = router;