const express = require("express");
const router = express.Router();
const multer = require("multer");
const { protect } = require("../middleware/authMiddleware");
const {
  updateProfile,
  getMe,
  getProfileById,
} = require("../controllers/auth.controller");

// Multer Config (Memory Storage for Profile Photo Uploads)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
});

const photoUploads = upload.fields([
  { name: "profilePic", maxCount: 1 },
  { name: "additionalPhotos", maxCount: 10 },
]);

// All user profile endpoints require authentication
router.use(protect);

// GET /api/user/profile - Fetch current authenticated user's profile
router.get("/profile", getMe);

// PUT /api/user/profile - Update current user's profile (including Anthem & Music Preferences)
router.put("/profile", photoUploads, updateProfile);

// GET /api/user/profile/:id - Fetch public profile of a user by ID
router.get("/profile/:id", getProfileById);

module.exports = router;
