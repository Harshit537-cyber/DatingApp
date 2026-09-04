const express = require("express");
const router = express.Router();

const {
  adminGetPlans,
  adminSavePlan,
  adminDeletePlan,
  adminGetUserMatchData,
  adminUpdateWallet,
  adminManageSubscription,
  adminResetUserSwipes,
  adminGetAllSubscriptions,
  adminGetPlatformStats,
  adminRemoveUserMatch,
} = require("../controllers/adminMatch.controller");

router.get("/plans", adminGetPlans);
router.post("/plans", adminSavePlan);
router.delete("/plans/:planId", adminDeletePlan);
router.get("/user/:userId", adminGetUserMatchData);
router.put("/user/:userId/wallet", adminUpdateWallet);
router.put("/user/:userId/subscription", adminManageSubscription);
router.post("/user/:userId/reset-swipes", adminResetUserSwipes);

router.get("/subscriptions/all", adminGetAllSubscriptions);
router.get("/stats/platform", adminGetPlatformStats);
router.post("/match/remove", adminRemoveUserMatch);

module.exports = router;