// DatingApp/routes/auth.routes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");

// Middleware Imports
const { protect } = require("../middleware/authMiddleware");

const {
  registerUser,
  loginUser,
  googleLogin, // Imported Google Auth logic
  appleLogin, // Imported Apple Auth logic
  getMe,
  updateProfile,
  deleteAccount,
  deactivateAccount,
  activateAccount,
  getProfileById,
  hideProfile,
  unhideProfile,
  submitHelpRequest,
  getUserHelpRequests,
  getHelpRequestById,
  getAllUsersCount
} = require("../controllers/auth.controller");

// Multer Config (Memory Storage for Cloudinary Uploads)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
});

const photoUploads = upload.fields([
  { name: "profilePic", maxCount: 1 },
  { name: "additionalPhotos", maxCount: 10 },
]);

const videoUploads = upload.array("videos", 5);

// 1 background video aur multiple (up to 10) card videos ke liye multer setup
const landingMediaUploads = upload.fields([
  { name: "backgroundVideo", maxCount: 1 },
  { name: "cardVideos", maxCount: 10 },
]);

router.post("/register", photoUploads, registerUser);
router.post("/login", loginUser);
router.post("/google", googleLogin); // Route registered
router.post("/apple", appleLogin);

// Nayi API endpoint background aur card videos upload karne ke liye
router.post("/landing-media", landingMediaUploads, uploadLandingMedia);

// ==========================================
// PROTECTED ROUTES (Requires JWT Auth Token)
// ==========================================
router.use(protect); // Middleware runs for all routes below

router.get("/me", getMe);
router.get("/profile/:id", getProfileById);
router.put("/profile", photoUploads, updateProfile);

router.get("/count", getAllUsersCount);

router.delete("/account", deleteAccount);
router.put("/deactivate", deactivateAccount);
router.put("/activate", activateAccount);
router.put("/hide", hideProfile);
router.put("/unhide", unhideProfile);

router.post("/support", submitHelpRequest);
router.get("/support", getUserHelpRequests);
router.get("/support/:id", getHelpRequestById);

module.exports = router;