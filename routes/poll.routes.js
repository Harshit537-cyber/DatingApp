const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const User = require("../models/user.model");
const Admin = require("../models/admin.model");
const {
  createPoll,
  getPolls,
  getPollById,
  votePoll,
  deletePoll,
} = require("../controllers/poll.controller");

/**
 * Flexible middleware allowing either an authenticated User or an Administrator
 * to access deletion endpoints.
 */
const authenticateUserOrAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, no token provided.",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 1. Check if token belongs to an active User
    const user = await User.findById(decoded.id).select("-password");
    if (user) {
      const tokenVersion = decoded.tokenVersion ?? 0;
      if (tokenVersion === user.tokenVersion) {
        req.user = user;
        return next();
      }
    }

    // 2. Check if token belongs to an Admin
    const admin = await Admin.findById(decoded.id).select("-password");
    if (admin) {
      req.admin = admin;
      return next();
    }

    return res.status(401).json({
      success: false,
      message: "Not authorized, invalid token.",
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Not authorized, invalid token.",
    });
  }
};

// --- Community Poll Endpoints ---
router.post("/", protect, createPoll);
router.get("/", protect, getPolls);
router.get("/:id", protect, getPollById);
router.post("/:id/vote", protect, votePoll);
router.delete("/:id", authenticateUserOrAdmin, deletePoll);

module.exports = router;
