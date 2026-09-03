const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

const {
  getAllEventsForAdmin,
  createEventByAdmin,
  updateEventByAdmin,
  deleteEventByAdmin,
  getAllDiscussionsForAdmin,
  deleteDiscussionByAdmin,
  getAllMembersForAdmin,
  getAdminDashboardStats,
  toggleMemberStatusByAdmin,
  deleteMemberByAdmin,
} = require("../controllers/admin.circle.controller");

router.use(protect);

router.get("/events", getAllEventsForAdmin);
router.post("/events", upload.single("image"), createEventByAdmin);
router.put("/events/:id", upload.single("image"), updateEventByAdmin);
router.delete("/events/:id", deleteEventByAdmin);

router.get("/discussions", getAllDiscussionsForAdmin);
router.delete("/discussions/:id", deleteDiscussionByAdmin);

router.get("/dashboard/stats", getAdminDashboardStats);
router.get("/members", getAllMembersForAdmin);
router.patch("/members/:id/toggle-status", toggleMemberStatusByAdmin);
router.delete("/members/:id", deleteMemberByAdmin);

module.exports = router;