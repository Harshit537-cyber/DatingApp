const User = require("../models/user.model");
const Event = require("../models/event.model");
const Discussion = require("../models/discussion.model");

const getCircleDashboard = async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const events = await Event.find({ isExclusive: true })
      .sort({ eventDate: 1 })
      .limit(5);

    const trendingDiscussions = await Discussion.find()
      .sort({ repliesCount: -1, createdAt: -1 })
      .limit(3);

    const spotlightMemberRaw = await User.findOne({
      _id: { $ne: currentUserId },
      isVerified: true,
      isDeactivated: false,
      isProfileHidden: false,
    })
      .select("name jobTitle livingIn profilePic bio matches")
      .lean();

    let memberSpotlight = null;
    if (spotlightMemberRaw) {
      memberSpotlight = {
        _id: spotlightMemberRaw._id,
        name: spotlightMemberRaw.name,
        role: `${spotlightMemberRaw.jobTitle || "Member"} | ${spotlightMemberRaw.livingIn || "Paris"}`,
        matchesCount: spotlightMemberRaw.matches ? spotlightMemberRaw.matches.length : 0,
        eventsCount: 8,
        status: "Premium",
        quote: spotlightMemberRaw.bio || "Seeking harmony between urban structure and human connection.",
        profilePic: spotlightMemberRaw.profilePic,
      };
    }

    const onlineCircleCount = await User.countDocuments({
      "subscription.isOnline": true,
    });

    return res.status(200).json({
      success: true,
      data: {
        events,
        trendingDiscussions,
        memberSpotlight,
        onlineCircleCount: onlineCircleCount || 1204,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const connectWithUser = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { targetUserId } = req.params;

    if (currentUserId === targetUserId) {
      return res.status(400).json({ success: false, message: "Cannot connect with yourself" });
    }

    const currentUser = await User.findById(currentUserId);
    const targetUser = await User.findById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({ success: false, message: "Target user not found" });
    }

    if (!currentUser.likes.includes(targetUserId)) {
      currentUser.likes.push(targetUserId);
    }

    let isMatch = false;
    if (targetUser.likes.includes(currentUserId)) {
      isMatch = true;
      if (!currentUser.matches.includes(targetUserId)) currentUser.matches.push(targetUserId);
      if (!targetUser.matches.includes(currentUserId)) targetUser.matches.push(currentUserId);
      await targetUser.save();
    }

    await currentUser.save();

    return res.status(200).json({
      success: true,
      message: isMatch ? "It's a match!" : "Connection request sent",
      isMatch,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getCircleDashboard,
  connectWithUser,
};