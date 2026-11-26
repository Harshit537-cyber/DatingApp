
const mongoose = require("mongoose");

const passwordResetSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    // Hashed OTP
    otpHash: {
      type: String,
      select: false,
    },

    otpExpiresAt: {
      type: Date,
    },

    otpAttempts: {
      type: Number,
      default: 0,
    },

    // Hashed single-use password reset token
    resetTokenHash: {
      type: String,
      select: false,
    },

    resetTokenExpiresAt: {
      type: Date,
    },
    
    otpSentAt: {
        type: Date,
    },

    // TTL cleanup timestamp
    expiresAt: {
      type: Date,
      required: true,
      index: {
        expireAfterSeconds: 0,
      },
    },

  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "PasswordReset",
  passwordResetSchema
);
