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
<<<<<<< HEAD
  getAllMembersForAdmin,
  getAdminDashboardStats,
  toggleMemberStatusByAdmin,
  deleteMemberByAdmin,
=======
>>>>>>> f849216383f768ce95594ede692360e8ab517990
} = require("../controllers/admin.circle.controller");

router.use(protect);

router.get("/events", getAllEventsForAdmin);
router.post("/events", upload.single("image"), createEventByAdmin);
router.put("/events/:id", upload.single("image"), updateEventByAdmin);
router.delete("/events/:id", deleteEventByAdmin);

router.get("/discussions", getAllDiscussionsForAdmin);
router.delete("/discussions/:id", deleteDiscussionByAdmin);

<<<<<<< HEAD
router.get("/dashboard/stats", getAdminDashboardStats);
router.get("/members", getAllMembersForAdmin);
router.patch("/members/:id/toggle-status", toggleMemberStatusByAdmin);
router.delete("/members/:id", deleteMemberByAdmin);

=======
>>>>>>> f849216383f768ce95594ede692360e8ab517990
module.exports = router;