const Plan = require("../models/plan.model");
const User = require("../models/user.model");

const getPlans = async (req, res) => {
  try {
    let plans = await Plan.find();

    if (plans.length === 0) {
      const defaultPlans = [
        {
          name: "Silver",
          subtitle: "BASIC LUXURY",
          prices: {
            monthly: 14.99,
            annual: 8.99,
          },
          features: [
            { text: "Unlimited Likes", included: true },
            { text: "5 Super Likes per day", included: true },
            { text: "Profile Boosts", included: false },
          ],
          isPopular: false,
        },
        {
          name: "Gold",
          subtitle: "ENHANCED EXPERIENCE",
          prices: {
            monthly: 29.99,
            annual: 17.99,
          },
          features: [
            { text: "Unlimited Likes", included: true },
            { text: "See Who Liked You", included: true },
            { text: "1 Profile Boost per week", included: true },
            { text: "Travel Mode enabled", included: true },
          ],
          isPopular: true,
        },
        {
          name: "Platinum",
          subtitle: "THE ULTIMATE SUITE",
          prices: {
            monthly: 59.99,
            annual: 35.99,
          },
          features: [
            { text: "Priority Messaging", included: true },
            { text: "24/7 Concierge Support", included: true },
            { text: "Elite Profile Badge", included: true },
            { text: "Hidden Status Visibility", included: true },
          ],
          isPopular: false,
        },
      ];

      plans = await Plan.insertMany(defaultPlans);
    }

    res.status(200).json({
      success: true,
      plans,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const addWalletBalance = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid amount",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.walletBalance = (user.walletBalance || 0) + Number(amount);
    await user.save();

    res.status(200).json({
      success: true,
      message: "Amount added to wallet successfully",
      walletBalance: user.walletBalance,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getWalletBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      walletBalance: user.walletBalance || 0,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const subscribePlan = async (req, res) => {
  try {
    const userId = req.user.id;
    const { planId, billingCycle, paymentMethod } = req.body;

    if (!["monthly", "annual"].includes(billingCycle)) {
      return res.status(400).json({
        success: false,
        message: "Invalid billing cycle. Must be monthly or annual.",
      });
    }

    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    const planPrice =
      billingCycle === "monthly" ? plan.prices.monthly : plan.prices.annual;
    const user = await User.findById(userId);

    if (paymentMethod === "wallet") {
      const currentBalance = user.walletBalance || 0;
      if (currentBalance < planPrice) {
        return res.status(400).json({
          success: false,
          message: `Insufficient wallet balance. Required: $${planPrice}, Available: $${currentBalance}`,
        });
      }
      user.walletBalance = currentBalance - planPrice;
    }

    const startDate = new Date();
    const endDate = new Date();
    if (billingCycle === "monthly") {
      endDate.setMonth(endDate.getMonth() + 1);
    } else {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }

    user.subscription = {
      plan: plan._id,
      billingCycle,
      startDate,
      endDate,
      isActive: true,
    };

    await user.save();
    await user.populate("subscription.plan");

    res.status(200).json({
      success: true,
      message: "Subscribed successfully",
      walletBalance: user.walletBalance || 0,
      subscription: user.subscription,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getUserSubscription = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).populate("subscription.plan");

    if (!user || !user.subscription || !user.subscription.isActive) {
      return res.status(200).json({
        success: true,
        hasActiveSubscription: false,
        subscription: null,
      });
    }

    res.status(200).json({
      success: true,
      hasActiveSubscription: true,
      subscription: user.subscription,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getPlans,
  addWalletBalance,
  getWalletBalance,
  subscribePlan,
  getUserSubscription,
};