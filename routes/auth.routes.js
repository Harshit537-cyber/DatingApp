// DatingApp/routes/auth.routes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");

// Middleware Imports
const { protect } = require("../middleware/authMiddleware");

// Controller Functions Import
const {
  registerUser,
  loginUser,
  googleLogin, // Imported Google Auth logic
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
const upload = multer({ storage });

// File fields definition for Registration and Profile Update
const photoUploads = upload.fields([
  { name: "profilePic", maxCount: 1 },
  { name: "additionalPhotos", maxCount: 10 },
]);

// ==========================================
// PUBLIC ROUTES (No Login Required)
// ==========================================
router.post("/register", photoUploads, registerUser);
router.post("/login", loginUser);
router.post("/google", googleLogin); // Route registered


// ==========================================
// PROTECTED ROUTES (Requires JWT Auth Token)
// ==========================================
router.use(protect); // Middleware runs for all routes below

// Profile Routes
router.get("/me", getMe);
router.get("/profile/:id", getProfileById);
router.put("/profile", photoUploads, updateProfile);

router.get("/count", getAllUsersCount);

// Account Settings Routes
router.delete("/account", deleteAccount);
router.put("/deactivate", deactivateAccount);
router.put("/activate", activateAccount);
router.put("/hide", hideProfile);
router.put("/unhide", unhideProfile);

// Help & Support Routes
router.post("/support", submitHelpRequest);
router.get("/support", getUserHelpRequests);
router.get("/support/:id", getHelpRequestById);

module.exports = router;