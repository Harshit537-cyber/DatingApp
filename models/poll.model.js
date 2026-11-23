const mongoose = require("mongoose");

const pollOptionSchema = new mongoose.Schema(
  {
    optionIndex: { type: Number, required: true },
    optionText: { type: String, required: true, trim: true, maxlength: 100 },
    voteCount: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const pollSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    question: {
      type: String,
      required: [true, "Poll question is required"],
      trim: true,
      maxlength: 250,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      default: "DATING VIBE",
      enum: [
        "DATING VIBE",
        "FIRST MOVES",
        "GREEN FLAGS",
        "RED FLAGS",
        "TRAVEL & ESCAPES",
        "NIGHTLIFE",
        "DATING ETIQUETTE",
        "WEEKEND RHYTHM",
        "UNFILTERED",
      ],
    },
    options: {
      type: [pollOptionSchema],
      validate: {
        validator: function (opts) {
          return Array.isArray(opts) && opts.length >= 2 && opts.length <= 4;
        },
        message: "A poll must have between 2 and 4 options.",
      },
    },
    totalVotes: {
      type: Number,
      default: 0,
      min: 0,
    },
    discussionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Discussion",
      default: null,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default 7 days
    },
    status: {
      type: String,
      enum: ["active", "closed"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient sorting in feeds by status & creation date
pollSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Poll", pollSchema);
