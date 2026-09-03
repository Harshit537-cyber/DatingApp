const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["wallet_topup", "plan_subscription"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "usd",
    },
    status: {
      type: String,
      enum: ["pending", "succeeded", "failed"],
      default: "pending",
    },
    paymentIntentId: {
      type: String,
      required: true,
      unique: true,
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      default: null,
    },
    billingCycle: {
      type: String,
      enum: ["monthly", "annual", null],
      default: null,
    },
    paymentMethod: {
      type: String,
      enum: ["stripe", "wallet"],
      default: "stripe",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", transactionSchema);