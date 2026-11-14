const multer = require("multer");

const storyUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/jpg",
      "image/webp",
      "video/mp4",
      "video/quicktime",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error("Only JPEG, PNG, WEBP images and MP4/MOV videos are allowed.")
      );
    }

    cb(null, true);
  },
});

module.exports = storyUpload;