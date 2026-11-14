
const mongoose = require("mongoose");

// Permanent snapshot of a story added to a highlight
const highlightStorySchema = new mongoose.Schema(
  {
    originalStoryId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    mediaUrl: {
      type: String,
      required: true,
    },

    mediaPublicId: {
      type: String,
      default: "",
    },

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
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const storyHighlightSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  title: {
    type: String,
    required: true,
    maxlength: 25,
    trim: true,
  },

  coverUrl: {
    type: String,
    required: true,
  },

  stories: {
    type: [highlightStorySchema],
    default: [],
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },

  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("StoryHighlight", storyHighlightSchema);
