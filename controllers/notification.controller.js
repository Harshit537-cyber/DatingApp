const Notification = require("../models/notification.model");
const User = require("../models/user.model");

const sendNotificationToAll = async (req, res) => {
  try {
    const { title, message } = req.body;

    if (!title || !message) {
      return res.status(400).json({ message: "Title and message are required" });
    }

    const notification = await Notification.create({
      title,
      message,
      recipient: null,
    });

    res.status(201).json({
      message: "Notification sent to all users successfully",
      notification,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const sendNotificationToSingleUser = async (req, res) => {
  try {
    const { userId, title, message } = req.body;

    if (!userId || !title || !message) {
      return res.status(400).json({ message: "UserId, title and message are required" });
    }

    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(404).json({ message: "User not found" });
    }

    const notification = await Notification.create({
      title,
      message,
      recipient: userId,
    });

    res.status(201).json({
      message: "Notification sent to user successfully",
      notification,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAdminSentNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find()
      .populate("recipient", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      count: notifications.length,
      notifications,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getUserNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    const notifications = await Notification.find({
      $or: [{ recipient: userId }, { recipient: null }],
      clearedBy: { $ne: userId },
    }).sort({ createdAt: -1 });

    res.status(200).json({
      count: notifications.length,
      notifications,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const clearUserNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    await Notification.deleteMany({ recipient: userId });

    await Notification.updateMany(
      { recipient: null, clearedBy: { $ne: userId } },
      { $push: { clearedBy: userId } }
    );

    res.status(200).json({ message: "All notifications cleared successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  sendNotificationToAll,
  sendNotificationToSingleUser,
  getAdminSentNotifications,
  getUserNotifications,
  clearUserNotifications,
};