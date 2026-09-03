const Plan = require("../models/plan.model");
const User = require("../models/user.model");
const Transaction = require("../models/transaction.model");

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

    const query = {
      "subscription.plan": { $exists: true, $ne: null },
      "subscription.isTrial": false,
    };

    const [users, totalUsers] = await Promise.all([
      User.find(query)
        .populate("subscription.plan")
        .select("name email phone profilePic subscription createdAt")
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
    const now = new Date();

    const activePaidSubscribers = await User.countDocuments({
      "subscription.plan": { $exists: true, $ne: null },
      "subscription.isActive": true,
      "subscription.isTrial": false,
      "subscription.endDate": { $gt: now },
    });

    const activeTrialUsers = await User.countDocuments({
      "subscription.isActive": true,
      "subscription.isTrial": true,
      "subscription.endDate": { $gt: now },
    });

    return res.status(200).json({
      success: true,
      analytics: {
        totalPlans,
        activeSubscribers: activePaidSubscribers,
        activeTrialUsers,
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

const getAllTransactionsByAdmin = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.type) filter.type = req.query.type;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.paymentMethod) filter.paymentMethod = req.query.paymentMethod;

    const [transactions, totalTransactions] = await Promise.all([
      Transaction.find(filter)
        .populate("user", "name email profilePic")
        .populate("plan", "name prices")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Transaction.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      count: transactions.length,
      pagination: {
        totalTransactions,
        currentPage: page,
        totalPages: Math.ceil(totalTransactions / limit),
      },
      transactions,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getTransactionByIdByAdmin = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate("user", "name email phone profilePic")
      .populate("plan", "name subtitle prices features");

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    return res.status(200).json({
      success: true,
      transaction,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getTransactionAnalyticsByAdmin = async (req, res) => {
  try {
    const totalTransactionsCount = await Transaction.countDocuments({ status: "succeeded" });

    const revenueAggregation = await Transaction.aggregate([
      { $match: { status: "succeeded" } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
        },
      },
    ]);

    const totalRevenue = revenueAggregation.length > 0 ? revenueAggregation[0].totalRevenue : 0;

    const revenueByType = await Transaction.aggregate([
      { $match: { status: "succeeded" } },
      {
        $group: {
          _id: "$type",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      analytics: {
        totalSuccessfulTransactions: totalTransactionsCount,
        totalRevenue,
        revenueByType,
      },
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
  getAllTransactionsByAdmin,
  getTransactionByIdByAdmin,
  getTransactionAnalyticsByAdmin,
};