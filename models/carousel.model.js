const mongoose = require("mongoose");

const carouselSchema = new mongoose.Schema(
  {
    videoUrl: {
      type: String,
      required: true,
    },
    publicId: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Carousel", carouselSchema);