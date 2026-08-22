const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  createPlanByAdmin,
  getAllPlansByAdmin,
  getPlanByIdByAdmin,
  updatePlanByAdmin,
  deletePlanByAdmin,
  getUserSubscriptionsByAdmin,
  getPlanAnalyticsByAdmin,
  togglePlanPopularityByAdmin,
} = require("../controllers/adminPlan.controller");

router.route("/plans")
  .get(protect, getAllPlansByAdmin)
  .post(protect, createPlanByAdmin);

router.get("/plans/purchased-users", protect, getUserSubscriptionsByAdmin);
router.get("/plans/analytics", protect, getPlanAnalyticsByAdmin);

router.route("/plans/:id")
  .get(protect, getPlanByIdByAdmin)
  .put(protect, updatePlanByAdmin)
  .delete(protect, deletePlanByAdmin);

router.patch("/plans/:id/popularity", protect, togglePlanPopularityByAdmin);

module.exports = router;