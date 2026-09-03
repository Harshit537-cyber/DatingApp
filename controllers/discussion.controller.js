const Discussion = require("../models/discussion.model");

const createDiscussion = async (req, res) => {
  try {
    const { category, title, subtitle, isNewTag } = req.body;

    const discussion = await Discussion.create({
      category,
      title,
      subtitle,
      isNewTag: isNewTag !== undefined ? isNewTag : true,
      createdBy: req.user.id,
    });

    return res.status(201).json({ success: true, data: discussion });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getDiscussions = async (req, res) => {
  try {
    const discussions = await Discussion.find()
      .populate("createdBy", "name profilePic")
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, data: discussions });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getDiscussionById = async (req, res) => {
  try {
    const discussion = await Discussion.findById(req.params.id).populate(
      "createdBy",
      "name profilePic"
    );

    if (!discussion) {
      return res.status(404).json({ success: false, message: "Discussion not found" });
    }

    return res.status(200).json({ success: true, data: discussion });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const deleteDiscussion = async (req, res) => {
  try {
    const discussion = await Discussion.findById(req.params.id);

    if (!discussion) {
      return res.status(404).json({ success: false, message: "Discussion not found" });
    }

    if (discussion.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Not authorized to delete this discussion" });
    }

    await discussion.deleteOne();

    return res.status(200).json({ success: true, message: "Discussion deleted successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getDiscussionsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const discussions = await Discussion.find({ category })
      .populate("createdBy", "name profilePic")
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, data: discussions });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const searchDiscussions = async (req, res) => {
  try {
    const { query } = req.query;
    const discussions = await Discussion.find({
      $or: [
        { title: { $regex: query, $options: "i" } },
        { subtitle: { $regex: query, $options: "i" } }
      ]
    })
      .populate("createdBy", "name profilePic")
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, data: discussions });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createDiscussion,
  getDiscussions,
  getDiscussionById,
  deleteDiscussion,
  getDiscussionsByCategory,
  searchDiscussions,
};

