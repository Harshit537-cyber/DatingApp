const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    gender: {
      type: String,
      enum: ["male", "female", "other"],
      required: true,
    },
    interestedIn: {
      type: String,
      enum: ["male", "female", "both"],
      required: true,
    },
    age: {
      type: Number,
      required: true,
      min: 18,
    },
    bio: {
      type: String,
      maxlength: 500,
      default: "",
    },
    jobTitle: {
      type: String,
      default: "",
    },
    company: {
      type: String,
      default: "",
    },
    school: {
      type: String,
      default: "",
    },
    phone: {
      type: String,
      unique: true,
      sparse: true,
    },
    livingIn: {
      type: String,
      default: "",
    },
    height: {
      type: Number,
      default: null,
    },
    interests: [
      {
        type: String,
      },
    ],
    lifestyle: [
      {
        type: String,
      },
    ],
    languages: [
      {
        type: String,
      },
    ],
    profilePic: {
      type: String,
      required: true,
    },
    additionalPhotos: [
      {
        type: String,
      },
    ],
    blockedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    boostsAvailable: {
      type: Number,
      default: 1,
    },
    boostUntil: {
      type: Date,
      default: null,
    },

    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },
    isBanned: {
    type: Boolean,
    default: false
},
    distancePreference: {
      type: Number,
      default: 50,
    },
    agePreference: {
      min: { type: Number, default: 18 },
      max: { type: Number, default: 80 },
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    passes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    matches: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    superLikes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    isVerified: {
      type: Boolean,
      default: false,
    },
    isDeactivated: {
      type: Boolean,
      default: false,
    },
    deactivateReason: {
      type: String,
      default: "",
    },
    deactivatedAt: {
      type: Date,
      default: null,
    },
    isProfileHidden: {
      type: Boolean,
      default: false,
    },
    profileHiddenUntil: {
      type: Date,
      default: null,
    },
    walletBalance: {
      type: Number,
      default: 0,
    },
    subscription: {
      plan: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Plan",
        default: null,
      },
      billingCycle: {
        type: String,
        enum: ["monthly", "annual"],
        default: "monthly",
      },
      isOnline: {
        type: Boolean,
        default: false,
      },
      lastSeen: {
        type: Date,
        default: null,
      },
      startDate: {
        type: Date,
        default: null,
      },
      endDate: {
        type: Date,
        default: null,
      },
      isActive: {
        type: Boolean,
        default: false,
      },
    },
  },
  {
    timestamps: true,
  },
);

userSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("User", userSchema);
