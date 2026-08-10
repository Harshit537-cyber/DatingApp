const mongoose = require("mongoose");

const featureSchema = new mongoose.Schema({
  text: { type: String, required: true },
  included: { type: Boolean, default: true },
});

const planSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    subtitle: { type: String },
    prices: {
      monthly: { type: Number, required: true },
      annual: { type: Number, required: true },
    },
    features: [featureSchema],
    isPopular: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Plan", planSchema);