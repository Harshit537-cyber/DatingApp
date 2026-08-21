const express = require("express");
const router = express.Router();

const {
  getPlans,
  createWalletOrder,
  verifyAndAddWalletBalance,
  getWalletBalance,
  subscribePlan,
  verifyAndSubscribePlan,
  getUserSubscription,
} = require("../controllers/plan.controller");

const { protect } = require("../middleware/authMiddleware");

router.get("/allplans", getPlans);
router.post("/wallet/create-order", protect, createWalletOrder);
router.post("/wallet/verify", protect, verifyAndAddWalletBalance);
router.get("/wallet", protect, getWalletBalance);
router.post("/subscribe", protect, subscribePlan);
router.post("/subscribe/verify", protect, verifyAndSubscribePlan);
router.get("/subscription", protect, getUserSubscription);

module.exports = router;