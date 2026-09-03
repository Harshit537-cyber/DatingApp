<<<<<<< HEAD
const User = require("../models/user.model");
=======
>>>>>>> f849216383f768ce95594ede692360e8ab517990
const Event = require("../models/event.model");
const Discussion = require("../models/discussion.model");

const getAllEventsForAdmin = async (req, res) => {
  try {
    const events = await Event.find().sort({ eventDate: 1 });
    res.status(200).json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createEventByAdmin = async (req, res) => {
  try {
    const eventData = req.body;
    if (req.file) {
      eventData.image = req.file.path;
    }
    const newEvent = await Event.create(eventData);
    res.status(201).json({
      success: true,
      message: "Event created successfully",
      event: newEvent,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateEventByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    if (req.file) {
      updateData.image = req.file.path;
    }

    const updatedEvent = await Event.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedEvent) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    res.status(200).json({
      success: true,
      message: "Event updated successfully",
      event: updatedEvent,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteEventByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedEvent = await Event.findByIdAndDelete(id);

    if (!deletedEvent) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    res.status(200).json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAllDiscussionsForAdmin = async (req, res) => {
  try {
    const discussions = await Discussion.find()
      .populate("author", "name email profilePic")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: discussions.length,
      discussions,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteDiscussionByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedDiscussion = await Discussion.findByIdAndDelete(id);

    if (!deletedDiscussion) {
      return res.status(404).json({ success: false, message: "Discussion not found" });
    }

    res.status(200).json({
      success: true,
      message: "Discussion deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

<<<<<<< HEAD
const getAllMembersForAdmin = async (req, res) => {
  try {
    const members = await User.find().select("-password").sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: members.length,
      members,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAdminDashboardStats = async (req, res) => {
  try {
    const totalMembers = await User.countDocuments();
    const totalEvents = await Event.countDocuments();
    const totalDiscussions = await Discussion.countDocuments();
    const activeOnlineMembers = await User.countDocuments({ "subscription.isOnline": true });

    res.status(200).json({
      success: true,
      stats: {
        totalMembers,
        totalEvents,
        totalDiscussions,
        activeOnlineMembers,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const toggleMemberStatusByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ success: false, message: "Member not found" });
    }

    user.isDeactivated = !user.isDeactivated;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Member status updated successfully",
      isDeactivated: user.isDeactivated,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteMemberByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedUser = await User.findByIdAndDelete(id);

    if (!deletedUser) {
      return res.status(404).json({ success: false, message: "Member not found" });
    }

    res.status(200).json({
      success: true,
      message: "Member deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

=======
>>>>>>> f849216383f768ce95594ede692360e8ab517990
module.exports = {
  getAllEventsForAdmin,
  createEventByAdmin,
  updateEventByAdmin,
  deleteEventByAdmin,
  getAllDiscussionsForAdmin,
  deleteDiscussionByAdmin,
<<<<<<< HEAD
  getAllMembersForAdmin,
  getAdminDashboardStats,
  toggleMemberStatusByAdmin,
  deleteMemberByAdmin,
=======
>>>>>>> f849216383f768ce95594ede692360e8ab517990
};