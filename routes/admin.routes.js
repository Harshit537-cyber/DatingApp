const express = require("express");
const router = express.Router();

// Admin Middleware (अपनी फाइल लोकेशन के हिसाब से पाथ बदल लें)
const { protect } = require("../middleware/authMiddleware");

// Admin Controller Imports
const {
  registerAdmin,
  loginAdmin,
  sendOtp,
  verifyOtp,
  getAdminProfile,
  createUserByAdmin,
  getAllUsers,
  getUserById,
  updateUserByAdmin,
  deleteUserByAdmin,
  getDashboardStats,
  toggleUserStatus,
  getUsersByGender,
  exportUsersToExcel,
  getHelpRequests,
  resolveHelpRequest,
  getAllUserSubscriptions,
  searchUser
} = require("../controllers/admin.controller");

// Public Admin Routes
router.post("/register", registerAdmin); // No photoUploads here!
router.post("/login", loginAdmin);
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);

// Protected Admin Routes (Token required)
router.use(protect);

router.get("/profile", getAdminProfile);
router.get("/stats", getDashboardStats);

// User Management Routes by Admin
router.post("/users", createUserByAdmin);
router.get("/users", getAllUsers);
router.get("/users/gender/:gender", getUsersByGender);
router.get("/users/export", exportUsersToExcel);
router.get("/users/:id", getUserById);
router.put("/users/:id", updateUserByAdmin);
router.delete("/users/:id", deleteUserByAdmin);
router.patch("/users/:id/toggle-status", toggleUserStatus);

// Support Routes
router.get("/help-requests", getHelpRequests);
router.patch("/help-requests/:id/resolve", resolveHelpRequest);

module.exports = router;