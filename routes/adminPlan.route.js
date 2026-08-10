const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  createPlanByAdmin,
  getAllPlansByAdmin,
  getPlanByIdByAdmin,
  updatePlanByAdmin,
  deletePlanByAdmin,
} = require("../controllers/adminPlan.controller");

router.post("/plans", protect, createPlanByAdmin);
router.get("/plans", protect, getAllPlansByAdmin);
router.get("/plans/:id", protect, getPlanByIdByAdmin);
router.put("/plans/:id", protect, updatePlanByAdmin);
router.delete("/plans/:id", protect, deletePlanByAdmin);

module.exports = router;