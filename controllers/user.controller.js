const User = require('../models/user.model');
const Swipe = require('../models/swipe.model');

const getFeedProfiles = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id).populate('subscription.plan');

    const usersWhoBlockedMe = await User.find({ blockedUsers: currentUser._id }).distinct('_id');

    const excludeIds = [
      currentUser._id,
      ...currentUser.likes,
      ...currentUser.passes,
      ...currentUser.matches,
      ...currentUser.blockedUsers,
      ...usersWhoBlockedMe
    ];

    let query = {
      _id: { $nin: excludeIds },
      interestedIn: { $in: [currentUser.gender, 'both'] },
      age: { 
        $gte: currentUser.agePreference.min, 
        $lte: currentUser.agePreference.max 
      }
    };

    if (currentUser.interestedIn !== 'both') {
      query.gender = currentUser.interestedIn;
    }

    const profiles = await User.find(query).select('-password');
    res.json(profiles);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const filterProfiles = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id).populate('subscription.plan');
    const { gender, minAge, maxAge, minHeight, maxHeight, interests, isVerified } = req.body;

    const isSubscribed = currentUser.subscription && 
                        currentUser.subscription.isActive && 
                        new Date(currentUser.subscription.endDate) > new Date();

    const planName = currentUser.subscription?.plan?.name;
    const hasAdvancedFiltersAccess = isSubscribed && (planName === 'Gold' || planName === 'Platinum');

    if ((minHeight || maxHeight || interests || typeof isVerified === 'boolean') && !hasAdvancedFiltersAccess) {
      return res.status(403).json({
        message: "Advanced filters (Height, Interests, Verified Status) are available only on Gold and Platinum plans."
      });
    }

    const usersWhoBlockedMe = await User.find({ blockedUsers: currentUser._id }).distinct('_id');

    const excludeIds = [
      currentUser._id,
      ...currentUser.likes,
      ...currentUser.passes,
      ...currentUser.matches,
      ...currentUser.blockedUsers,
      ...usersWhoBlockedMe
    ];

    let query = {
      _id: { $nin: excludeIds },
      interestedIn: { $in: [currentUser.gender, 'both'] }
    };

    if (gender && gender !== 'both') {
      query.gender = gender;
    } else if (!gender && currentUser.interestedIn !== 'both') {
      query.gender = currentUser.interestedIn;
    }

    const minA = minAge ? Number(minAge) : currentUser.agePreference.min;
    const maxA = maxAge ? Number(maxAge) : currentUser.agePreference.max;
    query.age = { $gte: minA, $lte: maxA };

    if (hasAdvancedFiltersAccess) {
      if (minHeight || maxHeight) {
        query.height = {};
        if (minHeight) query.height.$gte = Number(minHeight);
        if (maxHeight) query.height.$lte = Number(maxHeight);
      }

      if (interests && interests.length > 0) {
        query.interests = { 
          $in: Array.isArray(interests) ? interests : interests.split(',') 
        };
      }

      if (typeof isVerified === 'boolean') {
        query.isVerified = isVerified;
      }
    }

    const profiles = await User.find(query).select('-password');
    res.json(profiles);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const likeProfile = async (req, res) => {
  try {
    const { likedUserId } = req.body;
    const currentUserId = req.user._id;

    if (currentUserId.toString() === likedUserId) {
      return res.status(400).json({ message: 'You cannot like yourself' });
    }

    const currentUser = await User.findById(currentUserId).populate('subscription.plan');
    const likedUser = await User.findById(likedUserId);

    if (!likedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (currentUser.blockedUsers.includes(likedUserId) || likedUser.blockedUsers.includes(currentUserId)) {
      return res.status(400).json({ message: 'Cannot perform action on blocked profile' });
    }

    const isSubscribed = currentUser.subscription && 
                        currentUser.subscription.isActive && 
                        new Date(currentUser.subscription.endDate) > new Date();

    if (!isSubscribed) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const likesToday = await Swipe.countDocuments({
        fromUser: currentUserId,
        action: 'like',
        createdAt: { $gte: startOfDay }
      });

      const FREE_DAILY_LIKE_LIMIT = 10;
      if (likesToday >= FREE_DAILY_LIKE_LIMIT) {
        return res.status(403).json({
          message: `Daily like limit reached (${FREE_DAILY_LIKE_LIMIT}/day). Subscribe to Silver, Gold, or Platinum for unlimited likes.`
        });
      }
    }

    if (!currentUser.likes.includes(likedUserId)) {
      currentUser.likes.push(likedUserId);
    }

    await Swipe.create({
      fromUser: currentUserId,
      toUser: likedUserId,
      action: 'like'
    });

    let isMatch = false;
    if (likedUser.likes.includes(currentUserId)) {
      isMatch = true;
      if (!currentUser.matches.includes(likedUserId)) {
        currentUser.matches.push(likedUserId);
      }
      if (!likedUser.matches.includes(currentUserId)) {
        likedUser.matches.push(currentUserId);
      }
      await likedUser.save();
    }

    await currentUser.save();

    res.json({
      message: isMatch ? 'Profile matched' : 'Profile liked successfully',
      match: isMatch
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMatches = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('matches', '-password');
    res.json(user.matches);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getWhoLikedMe = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id).populate('subscription.plan');

    const isSubscribed = currentUser.subscription && 
                        currentUser.subscription.isActive && 
                        new Date(currentUser.subscription.endDate) > new Date();

    const planName = currentUser.subscription?.plan?.name;
    const canSeeWhoLikedMe = isSubscribed && (planName === 'Gold' || planName === 'Platinum');

    if (!canSeeWhoLikedMe) {
      return res.status(403).json({
        message: "Seeing who liked you is available only on Gold and Platinum plans."
      });
    }

    const usersWhoBlockedMe = await User.find({ blockedUsers: req.user._id }).distinct('_id');

    const usersWhoLikedMe = await User.find({
      likes: req.user._id,
      _id: { 
        $nin: [...currentUser.matches, ...currentUser.blockedUsers, ...usersWhoBlockedMe] 
      }
    }).select('-password');

    res.json(usersWhoLikedMe);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const blockUser = async (req, res) => {
  try {
    const { blockedUserId } = req.body;
    const currentUserId = req.user._id;

    if (currentUserId.toString() === blockedUserId) {
      return res.status(400).json({ message: "You cannot block yourself" });
    }

    const userToBlock = await User.findById(blockedUserId);
    if (!userToBlock) {
      return res.status(404).json({ message: "User not found" });
    }

    await User.findByIdAndUpdate(currentUserId, {
      $addToSet: { blockedUsers: blockedUserId },
      $pull: { likes: blockedUserId, matches: blockedUserId }
    });

    await User.findByIdAndUpdate(blockedUserId, {
      $pull: { likes: currentUserId, matches: currentUserId }
    });

    res.json({ message: "User blocked successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const unblockUser = async (req, res) => {
  try {
    const { unblockedUserId } = req.body;
    const currentUserId = req.user._id;

    await User.findByIdAndUpdate(currentUserId, {
      $pull: { blockedUsers: unblockedUserId }
    });

    res.json({ message: "User unblocked successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getBlockedUsers = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('blockedUsers', '-password');
    res.json(user.blockedUsers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getFeedProfiles,
  filterProfiles,
  likeProfile,
  getMatches,
  getWhoLikedMe,
  blockUser,
  unblockUser,
  getBlockedUsers
};