const User = require("../models/user.model");
const Plan = require("../models/plan.model");

const adminGetPlans = async (req, res) => {
  try {
    const plans = await Plan.find();
    res.status(200).json({ success: true, plans });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const adminSavePlan = async (req, res) => {
  try {
    const { planId, name, subtitle, prices, features, isPopular } = req.body;
    let plan;

    if (planId) {
      plan = await Plan.findByIdAndUpdate(
        planId,
        { name, subtitle, prices, features, isPopular },
        { new: true }
      );
    } else {
      plan = new Plan({ name, subtitle, prices, features, isPopular });
      await plan.save();
    }

    res.status(200).json({ success: true, message: "Plan saved successfully", plan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const adminDeletePlan = async (req, res) => {
  try {
    const { planId } = req.params;
    await Plan.findByIdAndDelete(planId);
    res.status(200).json({ success: true, message: "Plan deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const adminGetUserMatchData = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId)
      .populate("subscription.plan")
      .populate("likes passes superLikes matches blockedUsers", "name email profilePic age gender");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({
      success: true,
      walletBalance: user.walletBalance || 0,
      subscription: user.subscription,
      boostUntil: user.boostUntil,
      likes: user.likes,
      passes: user.passes,
      superLikes: user.superLikes,
      matches: user.matches,
      blockedUsers: user.blockedUsers,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const adminUpdateWallet = async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, action } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (action === "set") {
      user.walletBalance = Number(amount);
    } else {
      user.walletBalance = (user.walletBalance || 0) + Number(amount);
    }

    await user.save();
    res.status(200).json({
      success: true,
      message: "Wallet updated successfully",
      walletBalance: user.walletBalance,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const adminManageSubscription = async (req, res) => {
  try {
    const { userId } = req.params;
    const { planId, billingCycle, isActive } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (isActive === false) {
      user.subscription = { isActive: false };
    } else {
      const plan = await Plan.findById(planId);
      if (!plan) return res.status(404).json({ success: false, message: "Plan not found" });

      const startDate = new Date();
      const endDate = new Date();
      if (billingCycle === "annual") {
        endDate.setFullYear(endDate.getFullYear() + 1);
      } else {
        endDate.setMonth(endDate.getMonth() + 1);
      }

      user.subscription = {
        plan: plan._id,
        billingCycle: billingCycle || "monthly",
        startDate,
        endDate,
        isActive: true,
      };
    }

    await user.save();
    await user.populate("subscription.plan");

    res.status(200).json({
      success: true,
      message: "User subscription updated by admin",
      subscription: user.subscription,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const adminResetUserSwipes = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.likes = [];
    user.passes = [];
    user.superLikes = [];
    user.matches = [];
    await user.save();

    res.status(200).json({ success: true, message: "User swipe history reset successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const adminGetAllSubscriptions = async (req, res) => {
  try {
    const users = await User.find({ "subscription.isActive": true })
      .populate("subscription.plan", "name prices")
      .select("name email profilePic subscription walletBalance");

    res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const adminGetPlatformStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeSubscriptions = await User.countDocuments({ "subscription.isActive": true });
    const totalMatches = await User.aggregate([
      { $project: { matchCount: { $size: { $ifNull: ["$matches", []] } } } },
      { $group: { _id: null, total: { $sum: "$matchCount" } } },
    ]);

    const walletBalanceSum = await User.aggregate([
      { $group: { _id: null, total: { $sum: "$walletBalance" } } },
    ]);

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        activeSubscriptions,
        totalMatches: totalMatches[0] ? totalMatches[0].total / 2 : 0,
        totalWalletBalance: walletBalanceSum[0] ? walletBalanceSum[0].total : 0,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const adminRemoveUserMatch = async (req, res) => {
  try {
    const { userId, targetUserId } = req.body;

    if (!userId || !targetUserId) {
      return res.status(400).json({ success: false, message: "Both userId and targetUserId are required" });
    }

    await User.findByIdAndUpdate(userId, {
      $pull: { matches: targetUserId, likes: targetUserId, superLikes: targetUserId },
    });

    await User.findByIdAndUpdate(targetUserId, {
      $pull: { matches: userId, likes: userId, superLikes: userId },
    });

    res.status(200).json({
      success: true,
      message: "Match removed successfully between users",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
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
};