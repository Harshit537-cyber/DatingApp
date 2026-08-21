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
} = require("../controllers/admin.circle.controller");

router.use(protect);

router.get("/events", getAllEventsForAdmin);
router.post("/events", upload.single("image"), createEventByAdmin);
router.put("/events/:id", upload.single("image"), updateEventByAdmin);
router.delete("/events/:id", deleteEventByAdmin);

router.get("/discussions", getAllDiscussionsForAdmin);
router.delete("/discussions/:id", deleteDiscussionByAdmin);

module.exports = router;