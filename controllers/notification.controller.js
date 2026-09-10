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

const scheduleNotification = async (req, res) => {
  try {
    const { title, message, recipient, scheduledTime } = req.body;

    if (!title || !message || !scheduledTime) {
      return res.status(400).json({ message: "Title, message and scheduledTime are required" });
    }

    const delay = new Date(scheduledTime).getTime() - Date.now();

    if (delay <= 0) {
      return res.status(400).json({ message: "Scheduled time must be in the future" });
    }

    if (recipient) {
      const userExists = await User.findById(recipient);
      if (!userExists) {
        return res.status(404).json({ message: "User not found" });
      }
    }

    setTimeout(async () => {
      try {
        await Notification.create({
          title,
          message,
          recipient: recipient || null,
        });
      } catch (err) {
        console.error(err.message);
      }
    }, delay);

    res.status(200).json({
      message: "Notification scheduled successfully",
      scheduledTime,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const resendNotification = async (req, res) => {
  try {
    const { id } = req.params;

    const existingNotification = await Notification.findById(id);

    if (!existingNotification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    const notification = await Notification.create({
      title: existingNotification.title,
      message: existingNotification.message,
      recipient: existingNotification.recipient,
    });

    res.status(201).json({
      message: "Notification resent successfully",
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

const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findByIdAndDelete(id);

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.status(200).json({ message: "Notification deleted successfully" });
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
  scheduleNotification,
  resendNotification,
  getAdminSentNotifications,
  deleteNotification,
  getUserNotifications,
  clearUserNotifications,
};