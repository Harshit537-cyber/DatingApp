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

    const minAge = currentUser.agePreference?.min || 18;
    const maxAge = currentUser.agePreference?.max || 100;

    const query = {
      _id: { $nin: excludedUserIds },
      isDeactivated: false,
      isProfileHidden: false,
      age: { $gte: minAge, $lte: maxAge },
    };

    if (targetGender) {
      query.gender = targetGender;
    }

    if (
      currentUser.location &&
      currentUser.location.coordinates &&
      currentUser.location.coordinates.length === 2 &&
      (currentUser.location.coordinates[0] !== 0 ||
        currentUser.location.coordinates[1] !== 0)
    ) {
      const radiusInRadians =
        (currentUser.distancePreference || 50) / 6378.1;

      query.location = {
        $geoWithin: {
          $centerSphere: [currentUser.location.coordinates, radiusInRadians],
        },
      };
    }

    const profiles = await User.find(query)
      .select(
        "name age gender bio jobTitle company school livingIn profilePic additionalPhotos location interests lifestyle languages height isVerified"
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

const filterProfiles = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page || req.body.page) || 1;
    const limit = parseInt(req.query.limit || req.body.limit) || 10;
    const skip = (page - 1) * limit;

    const {
      ageGroup,
      ageMin,
      ageMax,
      maxDistance,
      interests,
      lifestyle,
      languages,
      minHeight,
      maxHeight,
      isVerified,
    } = req.body;

    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    let parsedAgeMin = Number(ageMin);
    let parsedAgeMax = Number(ageMax);

    if (ageGroup) {
      if (ageGroup === "18-25") {
        parsedAgeMin = 18;
        parsedAgeMax = 25;
      } else if (ageGroup === "25-35") {
        parsedAgeMin = 25;
        parsedAgeMax = 35;
      } else if (ageGroup === "35-50") {
        parsedAgeMin = 35;
        parsedAgeMax = 50;
      } else if (ageGroup === "50+") {
        parsedAgeMin = 50;
        parsedAgeMax = 100;
      }
    }

    if (!parsedAgeMin) parsedAgeMin = currentUser.agePreference?.min || 18;
    if (!parsedAgeMax) parsedAgeMax = currentUser.agePreference?.max || 100;

    const distance = Number(maxDistance) || currentUser.distancePreference || 50;

    currentUser.agePreference = { min: parsedAgeMin, max: parsedAgeMax };
    currentUser.distancePreference = distance;
    await currentUser.save();

    let targetGender;
    if (currentUser.gender === "male") targetGender = "female";
    else if (currentUser.gender === "female") targetGender = "male";

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
      age: { $gte: parsedAgeMin, $lte: parsedAgeMax },
    };

    if (targetGender) query.gender = targetGender;

    if (isVerified !== undefined) {
      query.isVerified = Boolean(isVerified);
    }

    if (minHeight || maxHeight) {
      query.height = {};
      if (minHeight) query.height.$gte = Number(minHeight);
      if (maxHeight) query.height.$lte = Number(maxHeight);
    }

    if (interests && interests.length > 0) {
      query.interests = {
        $in: Array.isArray(interests) ? interests : [interests],
      };
    }

    if (lifestyle && lifestyle.length > 0) {
      query.lifestyle = {
        $in: Array.isArray(lifestyle) ? lifestyle : [lifestyle],
      };
    }

    if (languages && languages.length > 0) {
      query.languages = {
        $in: Array.isArray(languages) ? languages : [languages],
      };
    }

    if (
      currentUser.location &&
      currentUser.location.coordinates &&
      currentUser.location.coordinates.length === 2 &&
      (currentUser.location.coordinates[0] !== 0 ||
        currentUser.location.coordinates[1] !== 0)
    ) {
      const radiusInRadians = distance / 6378.1;
      query.location = {
        $geoWithin: {
          $centerSphere: [currentUser.location.coordinates, radiusInRadians],
        },
      };
    }

    const profiles = await User.find(query)
      .select(
        "name age gender bio jobTitle company school livingIn profilePic additionalPhotos location interests lifestyle languages height isVerified"
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

const likeProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ message: "Target user ID is required" });
    }

    if (userId === targetUserId) {
      return res.status(400).json({ message: "You cannot like yourself" });
    }

    const currentUser = await User.findById(userId);
    const targetUser = await User.findById(targetUserId);

    if (!currentUser || !targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    await User.findByIdAndUpdate(userId, {
      $addToSet: { likes: targetUserId },
    });

    const isMutualLike =
      targetUser.likes.includes(userId) ||
      targetUser.superLikes.includes(userId);

    let isMatch = false;

    if (isMutualLike) {
      isMatch = true;

      await User.findByIdAndUpdate(userId, {
        $addToSet: { matches: targetUserId },
      });

      await User.findByIdAndUpdate(targetUserId, {
        $addToSet: { matches: userId },
      });
    }

    res.status(200).json({
      success: true,
      isMatch,
      message: isMatch ? "Profile matched!" : "Profile liked successfully",
      matchedUser: isMatch
        ? {
            _id: targetUser._id,
            name: targetUser.name,
            profilePic: targetUser.profilePic,
            age: targetUser.age,
          }
        : null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const passProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ message: "Target user ID is required" });
    }

    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    await User.findByIdAndUpdate(userId, {
      $addToSet: { passes: targetUserId },
    });

    res.status(200).json({
      success: true,
      message: "Profile passed successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const rewindLastAction = async (req, res) => {
  try {
    const userId = req.user.id;
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ message: "Target user ID is required" });
    }

    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    await User.findByIdAndUpdate(userId, {
      $pull: {
        likes: targetUserId,
        passes: targetUserId,
        superLikes: targetUserId,
        matches: targetUserId,
      },
    });

    await User.findByIdAndUpdate(targetUserId, {
      $pull: {
        matches: userId,
      },
    });

    res.status(200).json({
      success: true,
      message: "Last action rewound successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMatches = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).populate({
      path: "matches",
      select:
        "name age gender bio jobTitle company school livingIn profilePic additionalPhotos location interests lifestyle languages height isVerified",
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      success: true,
      count: user.matches.length,
      matches: user.matches,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getNewMatches = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).populate({
      path: "matches",
      select:
        "name age gender bio jobTitle company school livingIn profilePic additionalPhotos location interests lifestyle languages height isVerified createdAt",
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const newMatches = [...user.matches].reverse();

    res.status(200).json({
      success: true,
      count: newMatches.length,
      newMatches,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getSwipeProfiles,
  filterProfiles,
  likeProfile,
  passProfile,
  rewindLastAction,
  getMatches,
  getNewMatches,
};