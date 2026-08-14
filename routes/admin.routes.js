const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

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

} = require("../controllers/admin.controller");

const {
  getAllReportsForAdmin,
  takeReportAction,
    getReportHistory
} = require("../controllers/admin.report.controller");

router.post("/register", registerAdmin);
router.post("/login", loginAdmin);
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);

router.use(protect);

router.get("/profile", getAdminProfile);
router.get("/stats", getDashboardStats);

router.post("/users", createUserByAdmin);
router.get("/users", getAllUsers);
router.get("/users/gender/:gender", getUsersByGender);
router.get("/users/export", exportUsersToExcel);
router.get("/users/:id", getUserById);
router.put("/users/:id", updateUserByAdmin);
router.delete("/users/:id", deleteUserByAdmin);
router.patch("/users/:id/toggle-status", toggleUserStatus);

router.get("/reports", getAllReportsForAdmin);
router.patch("/reports/:reportId/action", takeReportAction);

router.get("/help-requests", getHelpRequests);
router.patch("/help-requests/:id/resolve", resolveHelpRequest);

router.get("/reports/history", getReportHistory);

module.exports = router;