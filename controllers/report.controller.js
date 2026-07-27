const Report = require('../models/report.model');
const User = require('../models/user.model');


const reportSpamAccount = async (req, res) => {
    try {

        const { reportedUserId, reason, description } = req.body;

        const reportedBy = req.user.id;


        // Self report check
        if (reportedBy.toString() === reportedUserId) {
            return res.status(400).json({
                message: "You cannot report your own account"
            });
        }


        // Check user exists
        const user = await User.findById(reportedUserId);

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }


        const report = await Report.create({
            reportedBy,
            reportedUser: reportedUserId,
            reason,
            description
        });


        res.status(201).json({
            message: "Account reported successfully",
            report
        });


    } catch (error) {

        res.status(500).json({
            message: error.message
        });

    }
};
const getMyReports = async (req, res) => {
    try {

        const userId = req.user.id;


        const reports = await Report.find({
            reportedBy: userId
        })
        .populate("reportedUser", "name email profilePic age bio")
        .sort({ createdAt: -1 });


        res.status(200).json({
            message: "Your reports fetched successfully",
            count: reports.length,
            reports
        });


    } catch(error) {

        res.status(500).json({
            message: error.message
        });

    }
};

module.exports = {
    reportSpamAccount,
    getMyReports
};