const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  sendNotificationToAll,
  sendNotificationToSingleUser,
  scheduleNotification,
  resendNotification,
  getAdminSentNotifications,
  deleteNotification,
} = require("../controllers/notification.controller");

router.post("/send-all", protect, sendNotificationToAll);
router.post("/send-single", protect, sendNotificationToSingleUser);
router.post("/schedule", protect, scheduleNotification);
router.post("/resend/:id", protect, resendNotification);
router.get("/sent-history", protect, getAdminSentNotifications);
router.delete("/delete/:id", protect, deleteNotification);

module.exports = router;