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

module.exports = {
  createDiscussion,
  getDiscussions,
};