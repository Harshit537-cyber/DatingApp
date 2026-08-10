const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
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
  toggleUserStatus,
  getDashboardStats,
  getUsersByGender,
  exportUsersToExcel,
  getHelpRequests,
  resolveHelpRequest,
  getAllUserSubscriptions,
  searchUser
} = require("../controllers/admin.controller");
const {
  getAllReportsForAdmin,
  takeReportAction,
} = require("../controllers/admin.report.controller");

router.post("/register", registerAdmin);
router.post("/login", loginAdmin);
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);

router.get("/profile", protect, getAdminProfile);

router.post("/users", protect, createUserByAdmin);
router.get("/users", protect, getAllUsers);
router.get("/users/:id", protect, getUserById);
router.put("/users/:id", protect, updateUserByAdmin);
router.delete("/users/:id", protect, deleteUserByAdmin);

router.get("/stats", protect, getDashboardStats);
router.patch("/users/:id/status", protect, toggleUserStatus);

router.get("/reports", protect, getAllReportsForAdmin);
router.patch("/reports/:reportId/action", protect, takeReportAction);

router.get("/help-requests", protect, getHelpRequests);
router.patch("/help-requests/:id/resolve", protect, resolveHelpRequest);

router.get("/users/gender/:gender", protect, getUsersByGender);
router.get("/users/export/excel", protect, exportUsersToExcel);
router.get("/subscriptions",protect,getAllUserSubscriptions);
router.get("/search-user",protect,searchUser);
module.exports = router;