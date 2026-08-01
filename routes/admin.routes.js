const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const {
  registerAdmin,
  loginAdmin,
  getAdminProfile,
  createUserByAdmin,
  getAllUsers,
  getUserById,
  updateUserByAdmin,
  deleteUserByAdmin,
} = require("../controllers/admin.controller");

router.post("/register", registerAdmin);
router.post("/login", loginAdmin);
router.get("/profile", protect, getAdminProfile);

router.post("/users", protect, createUserByAdmin);
router.get("/users", protect, getAllUsers);
router.get("/users/:id", protect, getUserById);
router.put("/users/:id", protect, updateUserByAdmin);
router.delete("/users/:id", protect, deleteUserByAdmin);

module.exports = router;