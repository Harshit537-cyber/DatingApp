const mongoose = require('mongoose');

const ticketTierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    available: { type: Number, default: 100 },
    sold: { type: Number, default: 0 },
  },
  { _id: false }
);

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    dateText: { type: String, required: true },
    eventDate: { type: Date, required: true },
    location: { type: String, default: '' },
    description: { type: String, default: '' },
    dressCode: { type: String, default: '' },
    capacity: { type: Number, default: 200 },
    image: { type: String, required: true },
    isExclusive: { type: Boolean, default: true },
    hostedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    ticketTiers: {
      type: [ticketTierSchema],
      default: [
        { name: 'standard', price: 49.99, available: 100, sold: 0 },
        { name: 'vip', price: 99.99, available: 50, sold: 0 },
      ],
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'cancelled'],
      default: 'published',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Event', eventSchema);