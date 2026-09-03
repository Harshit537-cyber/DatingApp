const express = require("express");
const router = express.Router();

const { superLikeUser } = require("../controllers/swipe.controller");
const { protect } = require("../middleware/authMiddleware");
const { checkSubscription } = require("../middleware/checkSubscription"); 


router.post("/super-like", protect, checkSubscription, superLikeUser);

module.exports = router;