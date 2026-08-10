const express = require("express");
const router = express.Router();

const {
  getPlans,
  addWalletBalance,
  getWalletBalance,
  subscribePlan,
  getUserSubscription,
} = require("../controllers/plan.controller");

const { protect } = require("../middleware/authMiddleware");

router.get("/", getPlans);
router.post("/wallet/add", protect, addWalletBalance);
router.get("/wallet", protect, getWalletBalance);
router.post("/subscribe", protect, subscribePlan);
router.get("/subscription", protect, getUserSubscription);

module.exports = router;