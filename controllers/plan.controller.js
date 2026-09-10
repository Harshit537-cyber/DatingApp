const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const mongoose = require("mongoose");
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

// Wallet Balance Verification (Idempotent & Safe)
const verifyAndAddWalletBalance = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user.id;
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "Payment Intent ID is required" });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== "succeeded") {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "Payment has not been completed" });
    }

    if (paymentIntent.metadata.userId !== userId.toString()) {
      await session.abortTransaction();
      return res.status(403).json({ success: false, message: "Unauthorized payment verification" });
    }

    // Atomic Status Check
    const transaction = await Transaction.findOne({ paymentIntentId }).session(session);
    if (transaction && transaction.status === "succeeded") {
      await session.abortTransaction();
      const user = await User.findById(userId);
      return res.status(200).json({
        success: true,
        message: "Transaction already processed",
        walletBalance: user.walletBalance,
      });
    }

    const addedAmount = paymentIntent.amount / 100;
    
    // Atomic Wallet Update (No Race Condition)
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $inc: { walletBalance: addedAmount } },
      { new: true, session }
    );

    if (transaction) {
      transaction.status = "succeeded";
      await transaction.save({ session });
    } else {
      await Transaction.create(
        [{
          user: userId,
          type: "wallet_topup",
          amount: addedAmount,
          currency: paymentIntent.currency,
          status: "succeeded",
          paymentIntentId: paymentIntent.id,
          paymentMethod: "stripe",
        }],
        { session }
      );
    }

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: "Payment verified and wallet balance updated successfully",
      walletBalance: updatedUser.walletBalance,
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
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

// Plan Subscription (Race Condition Fixed via Atomic Update)
const subscribePlan = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user.id;
    const { planId, billingCycle, paymentMethod, currency = "usd" } = req.body;

    if (!["monthly", "annual"].includes(billingCycle)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "Invalid billing cycle." });
    }

    const plan = await Plan.findById(planId);
    if (!plan) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "Plan not found" });
    }

    const planPrice = billingCycle === "monthly" ? plan.prices.monthly : plan.prices.annual;

    if (paymentMethod === "wallet") {
      // ATOMIC UPDATE: Check and decrement balance simultaneously
      const updatedUser = await User.findOneAndUpdate(
        { _id: userId, walletBalance: { $gte: planPrice } },
        { $inc: { walletBalance: -planPrice } },
        { new: true, session }
      );

      if (!updatedUser) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: "Insufficient wallet balance or account busy. Please try again.",
        });
      }

      activateSubscription(updatedUser, plan._id, billingCycle);
      await updatedUser.save({ session });
      await updatedUser.populate("subscription.plan");

      const mockIntentId = `wallet_${userId}_${Date.now()}`;
      await Transaction.create(
        [{
          user: userId,
          type: "plan_subscription",
          amount: planPrice,
          currency: currency.toLowerCase(),
          status: "succeeded",
          paymentIntentId: mockIntentId,
          plan: plan._id,
          billingCycle,
          paymentMethod: "wallet",
        }],
        { session }
      );

      await session.commitTransaction();

      return res.status(200).json({
        success: true,
        message: "Subscribed successfully using wallet",
        walletBalance: updatedUser.walletBalance,
        subscription: updatedUser.subscription,
      });
    }

    // Stripe Flow
    await session.abortTransaction(); // Session not needed for external call

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
    await session.abortTransaction();
    res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

const verifyAndSubscribePlan = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user.id;
    const { paymentIntentId, planId, billingCycle } = req.body;

    if (!paymentIntentId) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "Payment Intent ID is required" });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== "succeeded") {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "Payment has not been completed" });
    }

    if (paymentIntent.metadata.userId !== userId.toString()) {
      await session.abortTransaction();
      return res.status(403).json({ success: false, message: "Unauthorized payment verification" });
    }

    const transaction = await Transaction.findOne({ paymentIntentId }).session(session);
    if (transaction && transaction.status === "succeeded") {
      await session.abortTransaction();
      const user = await User.findById(userId).populate("subscription.plan");
      return res.status(200).json({
        success: true,
        message: "Transaction already processed",
        subscription: user.subscription,
      });
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const targetPlanId = planId || paymentIntent.metadata.planId;
    const targetBillingCycle = billingCycle || paymentIntent.metadata.billingCycle;

    activateSubscription(user, targetPlanId, targetBillingCycle);
    await user.save({ session });
    await user.populate("subscription.plan");

    if (transaction) {
      transaction.status = "succeeded";
      await transaction.save({ session });
    } else {
      const plan = await Plan.findById(targetPlanId);
      const planPrice = plan
        ? (targetBillingCycle === "monthly" ? plan.prices.monthly : plan.prices.annual)
        : paymentIntent.amount / 100;

      await Transaction.create(
        [{
          user: userId,
          type: "plan_subscription",
          amount: planPrice,
          currency: paymentIntent.currency,
          status: "succeeded",
          paymentIntentId: paymentIntent.id,
          plan: targetPlanId,
          billingCycle: targetBillingCycle,
          paymentMethod: "stripe",
        }],
        { session }
      );
    }

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: "Payment verified and subscribed successfully",
      subscription: user.subscription,
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

// 🔒 ENTERPRISE STRIPE WEBHOOK HANDLER
const handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    // Signature Verify: Proves request came ONLY from Stripe
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`[Webhook Error] Signature Failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const session = await mongoose.startSession();

  try {
    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object;
      const { userId, type, planId, billingCycle } = paymentIntent.metadata;

      session.startTransaction();

      // Check if already processed
      const existingTx = await Transaction.findOne({ paymentIntentId: paymentIntent.id }).session(session);
      if (existingTx && existingTx.status === "succeeded") {
        await session.abortTransaction();
        return res.json({ received: true });
      }

      if (type === "wallet_topup") {
        const addedAmount = paymentIntent.amount / 100;
        await User.findByIdAndUpdate(
          userId,
          { $inc: { walletBalance: addedAmount } },
          { session }
        );
      } else if (type === "plan_subscription") {
        const user = await User.findById(userId).session(session);
        if (user) {
          activateSubscription(user, planId, billingCycle);
          await user.save({ session });
        }
      }

      await Transaction.findOneAndUpdate(
        { paymentIntentId: paymentIntent.id },
        { status: "succeeded" },
        { upsert: true, session }
      );

      await session.commitTransaction();
      console.log(`[Webhook] Successfully processed PaymentIntent: ${paymentIntent.id}`);
    } 
    else if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object;
      await Transaction.findOneAndUpdate(
        { paymentIntentId: paymentIntent.id },
        { 
          status: "failed", 
          failureReason: paymentIntent.last_payment_error?.message || "Payment failed" 
        }
      );
      console.log(`[Webhook] Payment Failed for Intent: ${paymentIntent.id}`);
    }

    res.json({ received: true });
  } catch (err) {
    await session.abortTransaction();
    console.error(`[Webhook Error] Execution failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  } finally {
    session.endSession();
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

const handlePaymentFailure = async (req, res) => {
  try {
    const { paymentIntentId, reason } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ success: false, message: "Payment Intent ID is required" });
    }

    const transaction = await Transaction.findOne({ paymentIntentId });

    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    transaction.status = "failed";
    if (reason) {
      transaction.failureReason = reason;
    }
    await transaction.save();

    res.status(200).json({
      success: true,
      message: "Transaction status updated to failed",
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
  handlePaymentFailure,
  handleStripeWebhook,
};