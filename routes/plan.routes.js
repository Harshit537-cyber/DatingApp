const express = require("express");
const router = express.Router();

const {
  getPlans,
  createWalletPaymentIntent,
  verifyAndAddWalletBalance,
  getWalletBalance,
  subscribePlan,
  verifyAndSubscribePlan,
  getUserSubscription,
  handlePaymentFailure,
} = require("../controllers/plan.controller");

const { protect } = require("../middleware/authMiddleware");

router.get("/allplans", getPlans);
router.post("/wallet/create-intent", protect, createWalletPaymentIntent);
router.post("/wallet/verify", protect, verifyAndAddWalletBalance);
router.get("/wallet", protect, getWalletBalance);
router.post("/subscribe", protect, subscribePlan);
router.post("/subscribe/verify", protect, verifyAndSubscribePlan);
router.get("/subscription", protect, getUserSubscription);
router.post("/payment-failed", protect, handlePaymentFailure);

module.exports = router;