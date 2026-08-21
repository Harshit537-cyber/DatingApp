const Plan = require("../models/plan.model");
const User = require("../models/user.model");

const getPlans = async (req, res) => {
  try {
    let plans = await Plan.find();

    if (plans.length === 0) {
      const defaultPlans = [
        {
          name: "Silver",
          subtitle: "BASIC LUXURY",
          prices: {
            monthly: 14.99,
            annual: 8.99,
          },
          features: [
            { text: "Unlimited Likes", included: true },
            { text: "5 Super Likes per day", included: true },
            { text: "Profile Boosts", included: false },
          ],
          isPopular: false,
        },
        {
          name: "Gold",
          subtitle: "ENHANCED EXPERIENCE",
          prices: {
            monthly: 29.99,
            annual: 17.99,
          },
          features: [
            { text: "Unlimited Likes", included: true },
            { text: "See Who Liked You", included: true },
            { text: "1 Profile Boost per week", included: true },
            { text: "Travel Mode enabled", included: true },
          ],
          isPopular: true,
        },
        {
          name: "Platinum",
          subtitle: "THE ULTIMATE SUITE",
          prices: {
            monthly: 59.99,
            annual: 35.99,
          },
          features: [
            { text: "Priority Messaging", included: true },
            { text: "24/7 Concierge Support", included: true },
            { text: "Elite Profile Badge", included: true },
            { text: "Hidden Status Visibility", included: true },
          ],
          isPopular: false,
        },
      ];

      plans = await Plan.insertMany(defaultPlans);
    }

    res.status(200).json({
      success: true,
      plans,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const addWalletBalance = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid amount",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.walletBalance = (user.walletBalance || 0) + Number(amount);
    await user.save();

    res.status(200).json({
      success: true,
      message: "Amount added to wallet successfully",
      walletBalance: user.walletBalance,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getWalletBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      walletBalance: user.walletBalance || 0,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const subscribePlan = async (req, res) => {
  try {
    const userId = req.user.id;
    const { planId, billingCycle, paymentMethod } = req.body;

    if (!["monthly", "annual"].includes(billingCycle)) {
      return res.status(400).json({
        success: false,
        message: "Invalid billing cycle. Must be monthly or annual.",
      });
    }

    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    const planPrice =
      billingCycle === "monthly" ? plan.prices.monthly : plan.prices.annual;
    const user = await User.findById(userId);

    if (paymentMethod === "wallet") {
      const currentBalance = user.walletBalance || 0;
      if (currentBalance < planPrice) {
        return res.status(400).json({
          success: false,
          message: `Insufficient wallet balance. Required: $${planPrice}, Available: $${currentBalance}`,
        });
      }
      user.walletBalance = currentBalance - planPrice;
    }

    const startDate = new Date();
    const endDate = new Date();
    if (billingCycle === "monthly") {
      endDate.setMonth(endDate.getMonth() + 1);
    } else {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }

    user.subscription = {
      plan: plan._id,
      billingCycle,
      startDate,
      endDate,
      isActive: true,
    };

    await user.save();
    await user.populate("subscription.plan");

    res.status(200).json({
      success: true,
      message: "Subscribed successfully",
      walletBalance: user.walletBalance || 0,
      subscription: user.subscription,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getUserSubscription = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).populate("subscription.plan");

    if (!user || !user.subscription || !user.subscription.isActive) {
      return res.status(200).json({
        success: true,
        hasActiveSubscription: false,
        subscription: null,
      });
    }

    res.status(200).json({
      success: true,
      hasActiveSubscription: true,
      subscription: user.subscription,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getSwipeProfiles = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const currentUser = await User.findById(userId).populate("subscription.plan");

    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    let targetGender;
    if (currentUser.gender && currentUser.gender.toLowerCase() === "male") {
      targetGender = "female";
    } else if (currentUser.gender && currentUser.gender.toLowerCase() === "female") {
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
      isDeactivated: { $ne: true },
      isProfileHidden: { $ne: true },
    };

    if (targetGender) {
      query.gender = { $regex: new RegExp(`^${targetGender}$`, "i") };
    }

    const profiles = await User.find(query)
      .select(
        "name age gender bio jobTitle company school livingIn profilePic additionalPhotos location interests lifestyle languages height isVerified"
      )
      .sort({ boostUntil: -1, _id: -1 })
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

    const currentUser = await User.findById(userId).populate("subscription.plan");
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
      isDeactivated: { $ne: true },
      isProfileHidden: { $ne: true },
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
      .sort({ boostUntil: -1, _id: -1 })
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

    const currentUser = await User.findById(userId).populate("subscription.plan");
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

    const currentUser = await User.findById(userId).populate("subscription.plan");
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

    const currentUser = await User.findById(userId).populate("subscription.plan");
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

    const user = await User.findById(userId).populate("subscription.plan").populate({
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

    const user = await User.findById(userId).populate("subscription.plan").populate({
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

const getWhoLikedMe = async (req, res) => {
  try {
    const userId = req.user.id;
    const currentUser = await User.findById(userId).populate("subscription.plan");

    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!currentUser.subscription || !currentUser.subscription.isActive) {
      return res.status(403).json({
        success: false,
        message: "Active subscription required to see who liked you",
      });
    }

    const excludedUserIds = [
      ...(currentUser.matches || []),
      ...(currentUser.blockedUsers || []),
    ];

    const usersWhoLikedMe = await User.find({
      likes: userId,
      _id: { $nin: excludedUserIds },
      isDeactivated: { $ne: true },
      isProfileHidden: { $ne: true },
    })
      .select(
        "name age gender bio jobTitle company school livingIn profilePic additionalPhotos location interests lifestyle languages height isVerified"
      )
      .lean();

    res.status(200).json({
      success: true,
      count: usersWhoLikedMe.length,
      users: usersWhoLikedMe,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getWhoLikedMeFiltered = async (req, res) => {
  try {
    const userId = req.user.id;
    const filter = req.query.filter || "all";
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const currentUser = await User.findById(userId).populate("subscription.plan");

    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!currentUser.subscription || !currentUser.subscription.isActive) {
      return res.status(403).json({
        success: false,
        message: "Active subscription required to see who liked you",
      });
    }

    const excludedUserIds = [
      ...(currentUser.matches || []),
      ...(currentUser.blockedUsers || []),
    ];

    const baseQuery = {
      likes: userId,
      _id: { $nin: excludedUserIds },
      isDeactivated: { $ne: true },
      isProfileHidden: { $ne: true },
    };

    const totalWaitingMatches = await User.countDocuments(baseQuery);

    const query = { ...baseQuery };
    let sortOption = {};

    if (filter === "recent") {
      sortOption = { _id: -1 };
    } else if (filter === "verified") {
      query.isVerified = true;
    } else if (filter === "nearby") {
      if (
        currentUser.location &&
        currentUser.location.coordinates &&
        currentUser.location.coordinates.length === 2 &&
        (currentUser.location.coordinates[0] !== 0 ||
          currentUser.location.coordinates[1] !== 0)
      ) {
        const radiusInRadians = (currentUser.distancePreference || 50) / 6378.1;
        query.location = {
          $geoWithin: {
            $centerSphere: [currentUser.location.coordinates, radiusInRadians],
          },
        };
      }
    }

    const users = await User.find(query)
      .select("name age jobTitle profilePic isVerified location")
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .lean();

    res.status(200).json({
      success: true,
      activeFilter: filter,
      totalWaitingMatches,
      count: users.length,
      users,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const searchLikes = async (req, res) => {
  try {
    const userId = req.user.id;
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({ message: "Search query is required" });
    }

    const currentUser = await User.findById(userId).populate("subscription.plan");

    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!currentUser.subscription || !currentUser.subscription.isActive) {
      return res.status(403).json({
        success: false,
        message: "Active subscription required to search likes",
      });
    }

    const excludedUserIds = [
      ...(currentUser.matches || []),
      ...(currentUser.blockedUsers || []),
    ];

    const searchQuery = {
      likes: userId,
      _id: { $nin: excludedUserIds },
      isDeactivated: { $ne: true },
      isProfileHidden: { $ne: true },
      $or: [
        { name: { $regex: query, $options: "i" } },
        { jobTitle: { $regex: query, $options: "i" } },
      ],
    };

    const users = await User.find(searchQuery)
      .select("name age jobTitle profilePic isVerified location")
      .lean();

    res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const activateBoost = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized access" });
    }

    const currentUser = await User.findById(userId).populate("subscription.plan");

    if (!currentUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (currentUser.isBanned || currentUser.isDeactivated) {
      return res.status(403).json({ success: false, message: "Account is not active" });
    }

    if (!currentUser.subscription || !currentUser.subscription.isActive) {
      return res.status(403).json({
        success: false,
        message: "Active subscription required to use profile boosts",
      });
    }

    const planName = currentUser.subscription.plan?.name?.toLowerCase();

    if (planName === "silver") {
      return res.status(403).json({
        success: false,
        message: "Profile boosts are not included in the Silver plan",
      });
    }

    const now = new Date();
    if (currentUser.boostUntil && new Date(currentUser.boostUntil) > now) {
      return res.status(400).json({ 
        success: false,
        message: "Boost is already active",
        boostUntil: currentUser.boostUntil 
      });
    }

    const BOOST_DURATION_MINUTES = 30;
    const boostUntil = new Date(now.getTime() + BOOST_DURATION_MINUTES * 60 * 1000);

    currentUser.boostUntil = boostUntil;
    await currentUser.save();

    return res.status(200).json({
      success: true,
      message: "Boost activated successfully",
      boostUntil,
      plan: planName,
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false,
      message: "Internal server error", 
      error: error.message 
    });
  }
};

module.exports = {
  getPlans,
  addWalletBalance,
  getWalletBalance,
  subscribePlan,
  getUserSubscription,
  getSwipeProfiles,
  filterProfiles,
  likeProfile,
  passProfile,
  rewindLastAction,
  getMatches,
  getNewMatches,
  getWhoLikedMe,
  searchLikes,
  getWhoLikedMeFiltered,
  activateBoost,
};