const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

const { getCircleDashboard, connectWithUser } = require("../controllers/circle.controller");
const { createEvent, getEvents } = require("../controllers/event.controller");
const {
  createDiscussion,
  getDiscussions,
  getDiscussionById,
  deleteDiscussion,
  getDiscussionsByCategory,
  searchDiscussions,
} = require("../controllers/discussion.controller");

router.get("/dashboard", protect, getCircleDashboard);
router.post("/connect/:targetUserId", protect, connectWithUser);

router.post("/events", upload.single("image"), createEvent);
router.get("/events", protect, getEvents);

router.post("/discussions", protect, createDiscussion);
router.get("/discussions", protect, getDiscussions);
router.get("/discussions/category/:category", protect, getDiscussionsByCategory);
router.get("/discussions/search", protect, searchDiscussions);
router.get("/discussions/:id", protect, getDiscussionById);
router.delete("/discussions/:id", protect, deleteDiscussion);

module.exports = router;