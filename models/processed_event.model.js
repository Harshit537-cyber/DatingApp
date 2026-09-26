const mongoose = require('mongoose');

const processedEventSchema = new mongoose.Schema(
  {
    stripeEventId: { type: String, required: true, unique: true },
    type: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ProcessedEvent', processedEventSchema);      
  