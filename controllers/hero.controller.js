const Hero = require("../models/hero.model");
const cloudinary = require("../config/cloudinary");

const uploadToCloudinary = (file, folder) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "video",
        folder: folder,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    uploadStream.end(file.buffer);
  });
};

const createOrUpdateHeroSection = async (req, res) => {
  try {
    const validBackgroundVideo =
      req.files &&
      req.files.backgroundVideo &&
      req.files.backgroundVideo[0] &&
      req.files.backgroundVideo[0].size > 0
        ? req.files.backgroundVideo[0]
        : null;

    const validCardVideos =
      req.files && req.files.cardVideos
        ? req.files.cardVideos.filter((f) => f.size > 0)
        : [];

    if (!validBackgroundVideo && validCardVideos.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one valid video file to upload",
      });
    }

    if (validCardVideos.length > 5) {
      return res.status(400).json({
        success: false,
        message: "You can upload a maximum of 5 card videos",
      });
    }

    let heroData = await Hero.findOne().sort({ createdAt: -1 });
    if (!heroData) {
      heroData = new Hero({ backgroundVideo: {}, cardVideos: [] });
    }

    if (validBackgroundVideo) {
      const result = await uploadToCloudinary(
        validBackgroundVideo,
        "hero_section/background"
      );
      heroData.backgroundVideo = {
        videoUrl: result.secure_url,
        publicId: result.public_id,
      };
    }

    if (validCardVideos.length > 0) {
      const uploadedCardVideos = [];
      for (const file of validCardVideos) {
        const result = await uploadToCloudinary(file, "hero_section/cards");
        uploadedCardVideos.push({
          videoUrl: result.secure_url,
          publicId: result.public_id,
        });
      }
      heroData.cardVideos = uploadedCardVideos;
    }

    await heroData.save();

    res.status(200).json({
      success: true,
      message: "Hero media updated successfully",
      hero: heroData,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getHeroSection = async (req, res) => {
  try {
    const heroData = await Hero.findOne().sort({ createdAt: -1 });

    if (!heroData) {
      return res.status(404).json({
        success: false,
        message: "No hero section media found",
      });
    }

    res.status(200).json({
      success: true,
      hero: heroData,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createOrUpdateHeroSection,
  getHeroSection,
};