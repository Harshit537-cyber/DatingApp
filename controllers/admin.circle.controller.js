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

module.exports = {
  getAllEventsForAdmin,
  createEventByAdmin,
  updateEventByAdmin,
  deleteEventByAdmin,
  getAllDiscussionsForAdmin,
  deleteDiscussionByAdmin,
};