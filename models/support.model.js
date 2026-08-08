const mongoose = require("mongoose");

const supportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    category: { type: String, default: "General" },
    status: { type: String, enum: ["open", "resolved"], default: "open" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Support", supportSchema);