const express = require("express");
const router = express.Router();
const multer = require("multer");

// Middleware Imports (Apne path ke hisab se adjust kar lein)
const { protect } = require("../middleware/authMiddleware");

// Controller Functions Import
const {
  registerUser,
  loginUser,
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
} = require("../controllers/auth.controller"); // Path apne folder structure ke hisab se check kar lein

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


// ==========================================
// PROTECTED ROUTES (Requires JWT Auth Token)
// ==========================================
router.use(protect); // Iske niche ke saare routes me 'protect' middleware chalega

// Profile Routes
router.get("/me", getMe);
router.get("/profile/:id", getProfileById);
router.put("/profile", photoUploads, updateProfile);

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