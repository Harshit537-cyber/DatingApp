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
  },
  { timestamps: true }
);

module.exports = mongoose.model("Discussion", discussionSchema);