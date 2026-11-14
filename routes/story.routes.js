const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");
const storyUpload = require("../middleware/storyUploadMiddleware");

const {
  createStory,
  getStoryFeed,
  viewStory,
  reactToStory,
  deleteStory,
  getUserHighlights,
  createHighlight,
  deleteHighlight,
} = require("../controllers/story.controller");

// Stories
router.post("/", protect, storyUpload.single("media"), createStory);
router.get("/feed", protect, getStoryFeed);
router.post("/:id/view", protect, viewStory);
router.post("/:id/react", protect, reactToStory);
router.delete("/:id", protect, deleteStory);

// Highlights
router.get("/highlights/:userId", protect, getUserHighlights);
router.post("/highlights", protect, createHighlight);
router.delete("/highlights/:id", protect, deleteHighlight);

module.exports = router;