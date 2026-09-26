const express = require('express');
const router = express.Router();
const { protectAdmin } = require('../middleware/authMiddleware');
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
  searchUser,
  getUserStatsAndUnmatchedUsers,
  getPendingHostApplications,
  getHostApplicationDocument,
  approveHostApplication,
  rejectHostApplication,
} = require('../controllers/admin.controller');

// Public Admin Auth Routes
router.post('/register', registerAdmin);
router.post('/login', loginAdmin);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);

// 🔒 Protected Admin Routes (Only Admin can access)
router.use(protectAdmin);

router.get('/profile', getAdminProfile);
router.get('/dashboard-stats', getDashboardStats);

// User Management
router.post('/users', createUserByAdmin);
router.get('/users', getAllUsers);
router.get('/users/search', searchUser);
router.get('/users/export', exportUsersToExcel);
router.get('/users/by-gender/:gender', getUsersByGender);
router.get('/users/stats-unmatched', getUserStatsAndUnmatchedUsers);
router.get('/users/subscriptions', getAllUserSubscriptions);
router.get('/users/:id', getUserById);
router.put('/users/:id', updateUserByAdmin);
router.delete('/users/:id', deleteUserByAdmin);
router.patch('/users/:id/toggle-status', toggleUserStatus);

// Support
router.get('/help-requests', getHelpRequests);
router.patch('/help-requests/:id/resolve', resolveHelpRequest);

// Host Applications Review & Approval (v3)
router.get('/host-applications', getPendingHostApplications);
router.get('/host-applications/:id/document', getHostApplicationDocument);
router.patch('/host-applications/:id/approve', approveHostApplication);
router.patch('/host-applications/:id/reject', rejectHostApplication);

module.exports = router;

