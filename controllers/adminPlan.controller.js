const Plan = require("../models/plan.model");
const User = require("../models/user.model");

const createPlanByAdmin = async (req, res) => {
  try {
    const { name, subtitle, prices, features, isPopular } = req.body;

    const existingPlan = await Plan.findOne({ name });
    if (existingPlan) {
      return res.status(400).json({
        success: false,
        message: "A plan with this name already exists",
      });
    }

    const plan = await Plan.create({ name, subtitle, prices, features, isPopular });

    return res.status(201).json({
      success: true,
      message: "Plan created successfully",
      plan,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getAllPlansByAdmin = async (req, res) => {
  try {
    const plans = await Plan.find();
    return res.status(200).json({
      success: true,
      count: plans.length,
      plans,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getPlanByIdByAdmin = async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    return res.status(200).json({
      success: true,
      plan,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const updatePlanByAdmin = async (req, res) => {
  try {
    const updatedPlan = await Plan.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updatedPlan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Plan updated successfully",
      plan: updatedPlan,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const deletePlanByAdmin = async (req, res) => {
  try {
    const planId = req.params.id;

    if (!planId) {
      return res.status(400).json({
        success: false,
        message: "Plan ID is required",
      });
    }

    const plan = await Plan.findByIdAndDelete(planId);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Plan deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getUserSubscriptionsByAdmin = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const query = { plan: { $exists: true, $ne: null } };

    const [users, totalUsers] = await Promise.all([
      User.find(query)
        .populate("plan")
        .select("name email phone profilePic plan planStartDate planEndDate createdAt")
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      count: users.length,
      pagination: {
        totalUsers,
        currentPage: page,
        totalPages: Math.ceil(totalUsers / limit),
      },
      users,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getPlanAnalyticsByAdmin = async (req, res) => {
  try {
    const totalPlans = await Plan.countDocuments();
    const activeSubscribers = await User.countDocuments({ plan: { $exists: true, $ne: null } });

    return res.status(200).json({
      success: true,
      analytics: {
        totalPlans,
        activeSubscribers,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const togglePlanPopularityByAdmin = async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    plan.isPopular = !plan.isPopular;
    await plan.save();

    return res.status(200).json({
      success: true,
      message: "Plan popularity updated successfully",
      plan,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createPlanByAdmin,
  getAllPlansByAdmin,
  getPlanByIdByAdmin,
  updatePlanByAdmin,
  deletePlanByAdmin,
  getUserSubscriptionsByAdmin,
  getPlanAnalyticsByAdmin,
  togglePlanPopularityByAdmin,
};