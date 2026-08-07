const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({

  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  reportedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  reason: {
    type: String,
    enum: [
      "Fake Profile",
      "Fake Photos",
      "Scam/Fraud",
      "Harassment",
      "Abusive Content",
      "Wrong Information",
      "Other"
    ],
    required: true
  },

  description: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending', 'resolved', 'dismissed'],
    default: 'pending'
},

  status: {
    type: String,
    enum: [
      "pending",
      "reviewed",
      "resolved"
    ],
    default: "pending"
  }

}, {
  timestamps: true
});


module.exports = mongoose.model("Report", reportSchema);