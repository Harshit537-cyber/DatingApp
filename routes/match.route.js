const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const { getSwipeProfiles } = require("../controllers/match.controller");

router.get("/feed", protect, getSwipeProfiles);

module.exports = router;