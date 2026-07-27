const User = require('../models/user.model');

const getFeedProfiles = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id);

    let query = {
      _id: { 
        $ne: currentUser._id, 
        $nin: [...currentUser.likes, ...currentUser.passes, ...currentUser.matches] 
      },
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
    const currentUser = await User.findById(req.user._id);
    const { gender, minAge, maxAge, minHeight, maxHeight, interests, isVerified } = req.body;

    let query = {
      _id: { 
        $ne: currentUser._id, 
        $nin: [...currentUser.likes, ...currentUser.passes, ...currentUser.matches] 
      },
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

    const currentUser = await User.findById(currentUserId);
    const likedUser = await User.findById(likedUserId);

    if (!likedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!currentUser.likes.includes(likedUserId)) {
      currentUser.likes.push(likedUserId);
    }

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

module.exports = {
  getFeedProfiles,
  filterProfiles,
  likeProfile,
  getMatches,
};