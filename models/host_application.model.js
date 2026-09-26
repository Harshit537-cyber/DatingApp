const mongoose = require('mongoose');

const hostApplicationSchema = new mongoose.Schema(
  {
    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    eventConcept: { type: String, required: true, trim: true },
    govIdNote: { type: String, default: '' },
    govIdImage: { type: String, default: '' },
    applicationFeePaymentIntentId: { type: String, default: null, unique: true, sparse: true },
    status: {
      type: String,
      enum: ['pending_review', 'approved', 'rejected', 're_verification_required'],
      default: 'pending_review',
    },
    adminNote: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('HostApplication', hostApplicationSchema);