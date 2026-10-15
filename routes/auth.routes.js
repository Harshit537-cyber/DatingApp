const express = require("express");
const router = express.Router();
const multer = require("multer");

const { protect } = require("../middleware/authMiddleware");

const {
  registerUser,
  loginUser,
  googleLogin,
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
  getAllUsersCount,
  uploadCarouselVideos,
  getCarouselVideos,
  uploadLandingMedia, // <-- Naya controller function import kiya
} = require("../controllers/auth.controller");

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
router.post("/google", googleLogin);

router.post("/carousel-videos", videoUploads, uploadCarouselVideos);
router.get("/carousel-videos", getCarouselVideos);

// Nayi API endpoint background aur card videos upload karne ke liye
router.post("/landing-media", landingMediaUploads, uploadLandingMedia);

router.use(protect);

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