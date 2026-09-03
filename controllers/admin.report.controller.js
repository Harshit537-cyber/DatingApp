const mongoose = require("mongoose");
const Report = require("../models/report.model");
const User = require("../models/user.model");

const REPORT_STATUS = {
  PENDING: "pending",
  RESOLVED: "resolved",
  DISMISSED: "dismissed",
};

const REPORT_ACTIONS = {
  BAN_USER: "ban_user",
  DISMISS: "dismiss",
  DELETE_USER: "delete_user",
};

const getAllReportsForAdmin = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;
    const statusFilter = req.query.status || null;

    const query = statusFilter ? { status: statusFilter } : {};

    const [reports, totalReports] = await Promise.all([
      Report.find(query)
        .populate("reportedBy", "name email profilePic")
        .populate("reportedUser", "name email profilePic age bio isBanned")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Report.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      count: reports.length,
      pagination: {
        totalReports,
        currentPage: page,
        totalPages: Math.ceil(totalReports / limit),
      },
      reports,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const takeReportAction = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { action } = req.body;

    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).json({ success: false, message: "Invalid Report ID" });
    }

    if (!Object.values(REPORT_ACTIONS).includes(action)) {
      return res.status(400).json({ success: false, message: "Invalid action type" });
    }

    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }

    switch (action) {
      case REPORT_ACTIONS.BAN_USER: {
        if (!report.reportedUser) {
          return res.status(404).json({ success: false, message: "Reported user no longer exists" });
        }

        await User.findByIdAndUpdate(report.reportedUser, { isBanned: true });
        report.status = REPORT_STATUS.RESOLVED;
        await report.save();

        return res.status(200).json({
          success: true,
          message: "User banned successfully and report resolved",
        });
      }

      case REPORT_ACTIONS.DISMISS: {
        report.status = REPORT_STATUS.DISMISSED;
        await report.save();

        return res.status(200).json({
          success: true,
          message: "Report dismissed successfully",
        });
      }

      case REPORT_ACTIONS.DELETE_USER: {
        if (!report.reportedUser) {
          return res.status(404).json({ success: false, message: "Reported user no longer exists" });
        }

        await Promise.all([
          User.findByIdAndDelete(report.reportedUser),
          Report.deleteMany({ reportedUser: report.reportedUser }),
        ]);

        return res.status(200).json({
          success: true,
          message: "User and all related reports deleted successfully",
        });
      }

      default:
        return res.status(400).json({ success: false, message: "Action not supported" });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const [totalUsers, totalBannedUsers, totalReports, pendingReports] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isBanned: true }),
      Report.countDocuments(),
      Report.countDocuments({ status: REPORT_STATUS.PENDING }),
    ]);

    return res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalBannedUsers,
        totalReports,
        pendingReports,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


const getReportHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const query = { status: REPORT_STATUS.RESOLVED };

    const [reports, totalReports] = await Promise.all([
      Report.find(query)
        .populate("reportedBy", "name email profilePic")
        .populate("reportedUser", "name email profilePic age bio isBanned")
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Report.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      count: reports.length,
      pagination: {
        totalReports,
        currentPage: page,
        totalPages: Math.ceil(totalReports / limit),
      },
      reports,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getAllReportsForAdmin,
  takeReportAction,
  getDashboardStats,
  getReportHistory
};