const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      required: true
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    message: {
      type: String,
      trim: true,
      default: '',
    },

    isRead: {
      type: Boolean,
      default: false,
    },

    messageType: {
      type: String,
      enum: ['text', 'image', 'music'],
      default: 'text',
    },

    isMusicShare: {
      type: Boolean,
      default: false,
    },

    musicShare: {
      trackId: { type: String, default: null },
      trackName: { type: String, default: null },
      artistName: { type: String, default: null },
      albumName: { type: String, default: null },
      albumArtUrl: { type: String, default: null },
      spotifyUrl: { type: String, default: null },
    },

  },
  {
    timestamps: true
  }
);


module.exports = mongoose.model('Message', messageSchema);