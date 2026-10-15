const express = require("express");
const router = express.Router();
const multer = require("multer");

const {
  createOrUpdateHeroSection,
  getHeroSection,
} = require("../controllers/hero.controller");

// Memory Storage
const storage = multer.memoryStorage();

// 👈 सिर्फ MP4 फाइल्स को allow करने के लिए Filter
const fileFilter = (req, file, cb) => {
  const isMp4 =
    file.mimetype === "video/mp4" ||
    file.originalname.toLowerCase().endsWith(".mp4");

  if (isMp4) {
    cb(null, true);
  } else {
    cb(new Error("Only .mp4 video files are allowed!"), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 150 * 1024 * 1024 }, // 150 MB Max limit
  fileFilter: fileFilter,
});

const heroUploads = upload.fields([
  { name: "backgroundVideo", maxCount: 1 },
  { name: "cardVideos", maxCount: 5 },
]);

// Multer error handling wrapper
const handleUpload = (req, res, next) => {
  heroUploads(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, message: err.message });
    } else if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
};

router.post("/upload", handleUpload, createOrUpdateHeroSection);
router.get("/", getHeroSection);

module.exports = router;