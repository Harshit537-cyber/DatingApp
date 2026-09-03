const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Plan = require("../models/plan.model");
const User = require("../models/user.model");
const Transaction = require("../models/transaction.model");

const getPlans = async (req, res) => {
  try {
    let plans = await Plan.find();

    if (plans.length === 0) {
      const defaultPlans = [
        {
          name: "Silver",
          subtitle: "BASIC LUXURY",
          prices: { monthly: 14.99, annual: 8.99 },
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
          prices: { monthly: 29.99, annual: 17.99 },
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
          prices: { monthly: 59.99, annual: 35.99 },
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

    res.status(200).json({ success: true, plans });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createWalletPaymentIntent = async (req, res) => {
  try {
    const { amount, currency = "usd" } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: "Please provide a valid amount" });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(amount) * 100),
      currency: currency.toLowerCase(),
      metadata: {
        userId: req.user.id.toString(),
        type: "wallet_topup",
      },
    });

    await Transaction.create({
      user: req.user.id,
      type: "wallet_topup",
      amount: Number(amount),
      currency: currency.toLowerCase(),
      status: "pending",
      paymentIntentId: paymentIntent.id,
      paymentMethod: "stripe",
    });

    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const verifyAndAddWalletBalance = async (req, res) => {
  try {
    const userId = req.user.id;
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ success: false, message: "Payment Intent ID is required" });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== "succeeded") {
      return res.status(400).json({ success: false, message: "Payment has not been completed" });
    }

    if (paymentIntent.metadata.userId !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized payment verification" });
    }

    const transaction = await Transaction.findOne({ paymentIntentId });
    if (transaction && transaction.status === "succeeded") {
      return res.status(400).json({ success: false, message: "Transaction already processed" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const addedAmount = paymentIntent.amount / 100;
    user.walletBalance = (user.walletBalance || 0) + addedAmount;
    await user.save();

    if (transaction) {
      transaction.status = "succeeded";
      await transaction.save();
    } else {
      await Transaction.create({
        user: userId,
        type: "wallet_topup",
        amount: addedAmount,
        currency: paymentIntent.currency,
        status: "succeeded",
        paymentIntentId: paymentIntent.id,
        paymentMethod: "stripe",
      });
    }

    res.status(200).json({
      success: true,
      message: "Payment verified and wallet balance updated successfully",
      walletBalance: user.walletBalance,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getWalletBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({ success: true, walletBalance: user.walletBalance || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const subscribePlan = async (req, res) => {
  try {
    const userId = req.user.id;
    const { planId, billingCycle, paymentMethod, currency = "usd" } = req.body;

    if (!["monthly", "annual"].includes(billingCycle)) {
      return res.status(400).json({ success: false, message: "Invalid billing cycle." });
    }

    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }

    const planPrice = billingCycle === "monthly" ? plan.prices.monthly : plan.prices.annual;
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
      activateSubscription(user, plan._id, billingCycle);
      await user.save();
      await user.populate("subscription.plan");

      const mockIntentId = `wallet_${userId}_${Date.now()}`;
      await Transaction.create({
        user: userId,
        type: "plan_subscription",
        amount: planPrice,
        currency: currency.toLowerCase(),
        status: "succeeded",
        paymentIntentId: mockIntentId,
        plan: plan._id,
        billingCycle,
        paymentMethod: "wallet",
      });

      return res.status(200).json({
        success: true,
        message: "Subscribed successfully using wallet",
        walletBalance: user.walletBalance,
        subscription: user.subscription,
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(planPrice) * 100),
      currency: currency.toLowerCase(),
      metadata: {
        userId: userId.toString(),
        planId: planId.toString(),
        billingCycle,
        type: "plan_subscription",
      },
    });

    await Transaction.create({
      user: userId,
      type: "plan_subscription",
      amount: planPrice,
      currency: currency.toLowerCase(),
      status: "pending",
      paymentIntentId: paymentIntent.id,
      plan: plan._id,
      billingCycle,
      paymentMethod: "stripe",
    });

    res.status(200).json({
      success: true,
      requiresStripe: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const verifyAndSubscribePlan = async (req, res) => {
  try {
    const userId = req.user.id;
    const { paymentIntentId, planId, billingCycle } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ success: false, message: "Payment Intent ID is required" });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== "succeeded") {
      return res.status(400).json({ success: false, message: "Payment has not been completed" });
    }

    if (paymentIntent.metadata.userId !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized payment verification" });
    }

    const transaction = await Transaction.findOne({ paymentIntentId });
    if (transaction && transaction.status === "succeeded") {
      return res.status(400).json({ success: false, message: "Transaction already processed" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const targetPlanId = planId || paymentIntent.metadata.planId;
    const targetBillingCycle = billingCycle || paymentIntent.metadata.billingCycle;

    activateSubscription(user, targetPlanId, targetBillingCycle);
    await user.save();
    await user.populate("subscription.plan");

    if (transaction) {
      transaction.status = "succeeded";
      await transaction.save();
    } else {
      const plan = await Plan.findById(targetPlanId);
      const planPrice = plan ? (targetBillingCycle === "monthly" ? plan.prices.monthly : plan.prices.annual) : paymentIntent.amount / 100;

      await Transaction.create({
        user: userId,
        type: "plan_subscription",
        amount: planPrice,
        currency: paymentIntent.currency,
        status: "succeeded",
        paymentIntentId: paymentIntent.id,
        plan: targetPlanId,
        billingCycle: targetBillingCycle,
        paymentMethod: "stripe",
      });
    }

    res.status(200).json({
      success: true,
      message: "Payment verified and subscribed successfully",
      subscription: user.subscription,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const activateSubscription = (user, planId, billingCycle) => {
  const startDate = new Date();
  const endDate = new Date();
  if (billingCycle === "monthly") {
    endDate.setMonth(endDate.getMonth() + 1);
  } else {
    endDate.setFullYear(endDate.getFullYear() + 1);
  }

  user.subscription = {
    plan: planId,
    billingCycle,
    startDate,
    endDate,
    isActive: true,
    isTrial: false,
  };
};

const getUserSubscription = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).populate("subscription.plan");

    if (!user || !user.subscription) {
      return res.status(200).json({
        success: true,
        hasActiveSubscription: false,
        subscription: null,
      });
    }

    const isExpired = new Date() > new Date(user.subscription.endDate);

    if (isExpired) {
      user.subscription.isActive = false;
      await user.save();

      return res.status(200).json({
        success: true,
        hasActiveSubscription: false,
        subscription: user.subscription,
      });
    }

    res.status(200).json({
      success: true,
      hasActiveSubscription: user.subscription.isActive,
      subscription: user.subscription,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getPlans,
  createWalletPaymentIntent,
  verifyAndAddWalletBalance,
  getWalletBalance,
  subscribePlan,
  verifyAndSubscribePlan,
  getUserSubscription,
};