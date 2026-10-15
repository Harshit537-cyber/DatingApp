const Hero = require("../models/hero.model");
const cloudinary = require("../config/cloudinary");

const uploadToCloudinary = async (file, folder) => {
  const b64 = Buffer.from(file.buffer).toString("base64");
  const dataURI = "data:" + file.mimetype + ";base64," + b64;
  return await cloudinary.uploader.upload(dataURI, {
    resource_type: "video",
    folder: folder,
  });
};

const createOrUpdateHeroSection = async (req, res) => {
  try {
    if (!req.files || (!req.files.backgroundVideo && !req.files.cardVideos)) {
      return res.status(400).json({
        message: "Please upload at least backgroundVideo or cardVideos",
      });
    }

    let heroData = await Hero.findOne().sort({ createdAt: -1 });
    if (!heroData) {
      heroData = new Hero({ backgroundVideo: {}, cardVideos: [] });
    }

    if (req.files.backgroundVideo && req.files.backgroundVideo.length > 0) {
      const file = req.files.backgroundVideo[0];
      const result = await uploadToCloudinary(file, "hero_section/background");
      heroData.backgroundVideo = {
        videoUrl: result.secure_url,
        publicId: result.public_id,
      };
    }

    if (req.files.cardVideos && req.files.cardVideos.length > 0) {
      if (req.files.cardVideos.length > 5) {
        return res.status(400).json({
          message: "You can upload a maximum of 5 card videos",
        });
      }

      const uploadedCardVideos = [];
      for (const file of req.files.cardVideos) {
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