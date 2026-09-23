const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const ticketSchema = new mongoose.Schema(
  {
    attendee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
    },
    ticketTier: {
      type: String,
      enum: ['standard', 'vip'],
      required: true,
    },
    wristbandType: {
      type: String,
      enum: ['the_one', 'open', 'good_time', 'vip_access'],
      required: true,
    },
    price: { type: Number, required: true },
    qrPayload: {
      type: String,
      unique: true,
      default: () => uuidv4(),
    },
    isScanned: { type: Boolean, default: false },
    scannedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['pending', 'active', 'cancelled', 'refunded'],
      default: 'pending',
    },
    // models/ticket.model.js me add karein:
purchaseExpiresAt: { 
  type: Date, 
  default: () => new Date(Date.now() + 15 * 60 * 1000) // 15 mins expiry
},
    paymentIntentId: { type: String, required: true, unique: true },
    currency: { type: String, default: 'usd' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Ticket', ticketSchema);