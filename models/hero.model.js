const mongoose = require("mongoose");

const heroSchema = new mongoose.Schema(
  {
    backgroundVideo: {
      videoUrl: {
        type: String,
        default: "",
      },
      publicId: {
        type: String,
        default: "",
      },
    },
    cardVideos: [
      {
        videoUrl: {
          type: String,
          required: true,
        },
        publicId: {
          type: String,
          default: "",
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Hero", heroSchema);