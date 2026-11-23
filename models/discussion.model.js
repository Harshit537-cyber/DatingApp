const mongoose = require("mongoose");

const discussionSchema = new mongoose.Schema(
  {
    category: { type: String, required: true, trim: true },
    isNewTag: { type: Boolean, default: false },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: "", trim: true },
    repliesCount: { type: Number, default: 0 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    pollId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Poll",
      default: null,
    },
    isPoll: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const Discussion = mongoose.models.Discussion || mongoose.model("Discussion", discussionSchema);

// Register CircleDiscussion alias if not already registered for cross-spec compatibility
if (!mongoose.models.CircleDiscussion) {
  mongoose.model("CircleDiscussion", discussionSchema);
}

module.exports = Discussion;