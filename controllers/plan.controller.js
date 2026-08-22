const Razorpay = require("razorpay");
const crypto = require("crypto");
const Plan = require("../models/plan.model");
const User = require("../models/user.model");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const getPlans = async (req, res) => {
  try {
    let plans = await Plan.find();

    if (plans.length === 0) {
      const defaultPlans = [
        {
          name: "1 bumpups",
          subtitle: "BASIC PLAN",
          prices: { monthly: 9.99, annual: 5.99 }, // Annual price apne hisaab se adjust kar sakte hain
          features: [
            { text: "1 Profile Bump per month", included: true },
            { text: "Standard Visibility", included: true },
            { text: "Priority Support", included: false },
          ],
          isPopular: false,
        },
        {
          name: "bumpups+",
          subtitle: "ENHANCED EXPERIENCE",
          prices: { monthly: 19.99, annual: 11.99 },
          features: [
            { text: "Unlimited Profile Bumps", included: true },
            { text: "See Who Liked You", included: true },
            { text: "Priority Support", included: false },
          ],
          isPopular: true,
        },
        {
          name: "bumpups Pro",
          subtitle: "THE ULTIMATE SUITE",
          prices: { monthly: 29.99, annual: 17.99 },
          features: [
            { text: "Unlimited Profile Bumps", included: true },
            { text: "Priority Messaging", included: true },
            { text: "24/7 Concierge Support", included: true },
            { text: "Elite Profile Badge", included: true },
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

const createWalletOrder = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: "Please provide a valid amount" });
    }

    const options = {
      amount: Math.round(Number(amount) * 100),
      currency: "INR",
      receipt: `wallet_rcpt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    res.status(200).json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const verifyAndAddWalletBalance = async (req, res) => {
  try {
    const userId = req.user.id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid payment signature" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.walletBalance = (user.walletBalance || 0) + Number(amount);
    await user.save();

    res.status(200).json({
      success: true,
      message: "Payment verified and amount added successfully",
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
    const { planId, billingCycle, paymentMethod } = req.body;

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

      return res.status(200).json({
        success: true,
        message: "Subscribed successfully using wallet",
        walletBalance: user.walletBalance,
        subscription: user.subscription,
      });
    }

    const options = {
      amount: Math.round(Number(planPrice) * 100),
      currency: "INR",
      receipt: `sub_rcpt_${Date.now()}`,
      notes: { userId, planId, billingCycle },
    };

    const order = await razorpay.orders.create(options);

    res.status(200).json({ success: true, requiresRazorpay: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const verifyAndSubscribePlan = async (req, res) => {
  try {
    const userId = req.user.id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId, billingCycle } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid payment signature" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    activateSubscription(user, planId, billingCycle);
    await user.save();
    await user.populate("subscription.plan");

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
  };
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
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getPlans,
  createWalletOrder,
  verifyAndAddWalletBalance,
  getWalletBalance,
  subscribePlan,
  verifyAndSubscribePlan,
  getUserSubscription,
};