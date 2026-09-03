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
<<<<<<< HEAD
  getAllTransactionsByAdmin,
  getTransactionByIdByAdmin,
  getTransactionAnalyticsByAdmin,
=======
>>>>>>> f849216383f768ce95594ede692360e8ab517990
} = require("../controllers/adminPlan.controller");

router.route("/plans")
  .get(protect, getAllPlansByAdmin)
  .post(protect, createPlanByAdmin);

router.get("/plans/purchased-users", protect, getUserSubscriptionsByAdmin);
router.get("/plans/analytics", protect, getPlanAnalyticsByAdmin);

<<<<<<< HEAD
router.get("/transactions", protect, getAllTransactionsByAdmin);
router.get("/transactions/analytics", protect, getTransactionAnalyticsByAdmin);
router.get("/transactions/:id", protect, getTransactionByIdByAdmin);

=======
>>>>>>> f849216383f768ce95594ede692360e8ab517990
router.route("/plans/:id")
  .get(protect, getPlanByIdByAdmin)
  .put(protect, updatePlanByAdmin)
  .delete(protect, deletePlanByAdmin);

router.patch("/plans/:id/popularity", protect, togglePlanPopularityByAdmin);

module.exports = router;