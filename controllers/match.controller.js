const User = require("../models/user.model");

const getSwipeProfiles = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const currentUser = await User.findById(userId);

    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    let targetGender;
    if (currentUser.gender === "male") {
      targetGender = "female";
    } else if (currentUser.gender === "female") {
      targetGender = "male";
    }

    const excludedUserIds = [
      currentUser._id,
      ...(currentUser.likes || []),
      ...(currentUser.passes || []),
      ...(currentUser.superLikes || []),
      ...(currentUser.blockedUsers || []),
    ];

    const query = {
      _id: { $nin: excludedUserIds },
      isDeactivated: false,
      isProfileHidden: false,
    };

    if (targetGender) {
      query.gender = targetGender;
    }

    const profiles = await User.find(query)
      .select(
        "name age gender bio jobTitle company school livingIn profilePic additionalPhotos location interests height"
      )
      .skip(skip)
      .limit(limit)
      .lean();

    const totalProfiles = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      page,
      limit,
      totalProfiles,
      totalPages: Math.ceil(totalProfiles / limit),
      count: profiles.length,
      profiles,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getSwipeProfiles,
};