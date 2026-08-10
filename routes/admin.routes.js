const express = require("express");
const router = express.Router();
const multer = require("multer");

const { protect } = require("../middleware/authMiddleware");

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
} = require("../controllers/auth.controller");

const storage = multer.memoryStorage();
const upload = multer({ storage });

const photoUploads = upload.fields([
  { name: "profilePic", maxCount: 1 },
  { name: "additionalPhotos", maxCount: 10 },
]);

router.post("/register", photoUploads, registerUser);
router.post("/login", loginUser);

router.use(protect);

router.get("/me", getMe);
router.get("/profile/:id", getProfileById);
router.put("/profile", photoUploads, updateProfile);

router.delete("/account", deleteAccount);
router.put("/deactivate", deactivateAccount);
router.put("/activate", activateAccount);
router.put("/hide", hideProfile);
router.put("/unhide", unhideProfile);

router.post("/support", submitHelpRequest);
router.get("/support", getUserHelpRequests);
router.get("/support/:id", getHelpRequestById);

module.exports = router;