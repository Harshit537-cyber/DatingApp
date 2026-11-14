const mongoose = require("mongoose");

// Music sticker displayed on a story
const storyMusicStickerSchema = new mongoose.Schema(
  {
    trackId: {
      type: String,
      required: true,
    },
    trackName: {
      type: String,
      required: true,
    },
    artistName: {
      type: String,
      required: true,
    },
    albumArtUrl: {
      type: String,
      default: "",
    },
    spotifyUrl: {
      type: String,
      default: "",
    },
    stickerType: {
      type: String,
      enum: ["card", "vinyl", "equalizer"],
      default: "card",
    },
    positionX: {
      type: Number,
      default: 0.5,
      min: 0,
      max: 1,
    },
    positionY: {
      type: Number,
      default: 0.7,
      min: 0,
      max: 1,
    },
  },
  { _id: false },
);

const storySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  mediaUrl: {
    type: String,
    required: true,
  },

  mediaPublicId: { type: String, default: ""},

  mediaType: {
    type: String,
    enum: ["image", "video"],
    default: "image",
  },

  caption: {
    type: String,
    default: "",
    maxlength: 200,
  },

  musicSticker: {
    type: storyMusicStickerSchema,
    default: null,
  },

  viewers: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      viewedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],

  reactions: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      reactionType: {
        type: String,
        enum: ["🔥", "❤️", "😍", "🥂", "👏"],
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],

  createdAt: {
    type: Date,
    default: Date.now,
  },

  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
    expires: 0,
  },
});

module.exports = mongoose.model("Story", storySchema);
