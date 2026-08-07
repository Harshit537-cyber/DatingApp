const Report = require("../models/report.model");
const User = require("../models/user.model");

const getAllReportsForAdmin = async (req, res) => {
  try {
    const reports = await Report.find()
      .populate("reportedBy", "name email profilePic")
      .populate("reportedUser", "name email profilePic age bio isBanned")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reports.length,
      reports,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const takeReportAction = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { action } = req.body;

    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    if (action === "ban_user") {
      await User.findByIdAndUpdate(report.reportedUser, { isBanned: true });
      report.status = "resolved";
      await report.save();

      return res.status(200).json({
        message: "User banned successfully and report resolved",
      });
    }

    if (action === "dismiss") {
      report.status = "dismissed";
      await report.save();

      return res.status(200).json({
        message: "Report dismissed successfully",
      });
    }

    if (action === "delete_user") {
      await User.findByIdAndDelete(report.reportedUser);
      await Report.deleteMany({ reportedUser: report.reportedUser });

      return res.status(200).json({
        message: "User and related reports deleted successfully",
      });
    }

    return res.status(400).json({ message: "Invalid action type" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getDashboardStats  = async (req, res) => {
  try {
    const totalUsers = await User.countDocument();

    const totalBannedUsers = await Report.countDocument({
      status: "pending",
    });
    const totalReports = await Report.countDocuments();
    const pendingReports = await Report.countDocuments({ status: "pending" });

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalBannedUsers,
        totalReports,
        pendingReports,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAllReportsForAdmin,
  takeReportAction,
  getDashboardStats 
};
