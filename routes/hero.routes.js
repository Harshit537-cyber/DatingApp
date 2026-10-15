const express = require("express");
const router = express.Router();
const multer = require("multer");

const {
  createOrUpdateHeroSection,
  getHeroSection,
} = require("../controllers/hero.controller");

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 150 * 1024 * 1024 },
});

const heroUploads = upload.fields([
  { name: "backgroundVideo", maxCount: 1 },
  { name: "cardVideos", maxCount: 5 },
]);

router.post("/upload", heroUploads, createOrUpdateHeroSection);
router.get("/", getHeroSection);

module.exports = router;