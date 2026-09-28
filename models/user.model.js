const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    gender: { 
      type: String, 
      enum: ['male', 'female', 'other', null], 
      default: null 
    },
    interestedIn: { 
      type: String, 
      enum: ['male', 'female', 'both', null], 
      default: null 
    },
    age: { 
      type: Number, 
      default: null,
      validate: {
        validator: function (v) {
          return v === null || v === undefined || v >= 18;
        },
        message: 'Age must be at least 18',
      },
    },
    bio: { type: String, maxlength: 500, default: '' },
    jobTitle: { type: String, default: '' },
    company: { type: String, default: '' },
    school: { type: String, default: '' },
    phone: { type: String, unique: true, sparse: true },
    livingIn: { type: String, default: '' },
    height: { type: Number, default: null },
    interests: [{ type: String }],
    lifestyle: [{ type: String }],
    languages: [{ type: String }],
    profilePic: { type: String, default: '' },
    additionalPhotos: [{ type: String }],
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    boostsAvailable: { type: Number, default: 1 },
    boostUntil: { type: Date, default: null },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    isBanned: { type: Boolean, default: false },
    distancePreference: { type: Number, default: 50 },
    agePreference: {
      min: { type: Number, default: 18 },
      max: { type: Number, default: 80 },
    },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    passes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    matches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    superLikes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isVerified: { type: Boolean, default: false },
    isDeactivated: { type: Boolean, default: false },
    deactivateReason: { type: String, default: '' },
    deactivatedAt: { type: Date, default: null },
    isProfileHidden: { type: Boolean, default: false },
    profileHiddenUntil: { type: Date, default: null },
    walletBalance: { type: Number, default: 0 },
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: null },
    subscription: {
      plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', default: null },
      billingCycle: { type: String, enum: ['trial', 'monthly', 'annual'], default: 'trial' },
      startDate: { type: Date, default: Date.now },
      endDate: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      isActive: { type: Boolean, default: true },
      isTrial: { type: Boolean, default: true },
    },
    // Host & Payout fields (v3 Hardened)
    hostStatus: {
      type: String,
      enum: ['none', 'pending', 'approved', 'rejected'],
      default: 'none',
    },
    isVerifiedHost: { type: Boolean, default: false },
    hostApplicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'HostApplication', default: null },
    stripeConnectAccountId: { type: String, default: null },
    payoutsEnabled: { type: Boolean, default: false },
    chargesEnabled: { type: Boolean, default: false },
    detailsSubmitted: { type: Boolean, default: false },
    stripeRequirementsDue: { type: [String], default: [] },
    stripeAccountStatus: {
      type: String,
      enum: ['not_started', 'onboarding_pending', 'restricted', 'active', 'disabled'],
      default: 'not_started',
    },
    stripeStateUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.index({ location: '2dsphere' });
module.exports = mongoose.model('User', userSchema);