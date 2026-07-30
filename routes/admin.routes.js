const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const {
  registerAdmin,
  loginAdmin,
  getAdminProfile,
  getAllUsers,
  deleteUserByAdmin,
} = require("../controllers/admin.controller");

router.post("/register", registerAdmin);
router.post("/login", loginAdmin);
router.get("/profile", protect, getAdminProfile);
router.get("/users", protect, getAllUsers);
router.delete("/users/:id", protect, deleteUserByAdmin);

module.exports = router;