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
  getAllTransactionsByAdmin,
  getTransactionByIdByAdmin,
  getTransactionAnalyticsByAdmin,
} = require("../controllers/adminPlan.controller");

router.route("/plans")
  .get(protect, getAllPlansByAdmin)
  .post(protect, createPlanByAdmin);

router.get("/plans/purchased-users", protect, getUserSubscriptionsByAdmin);
router.get("/plans/analytics", protect, getPlanAnalyticsByAdmin);

router.get("/transactions", protect, getAllTransactionsByAdmin);
router.get("/transactions/analytics", protect, getTransactionAnalyticsByAdmin);
router.get("/transactions/:id", protect, getTransactionByIdByAdmin);

router.route("/plans/:id")
  .get(protect, getPlanByIdByAdmin)
  .put(protect, updatePlanByAdmin)
  .delete(protect, deletePlanByAdmin);

router.patch("/plans/:id/popularity", protect, togglePlanPopularityByAdmin);

module.exports = router;