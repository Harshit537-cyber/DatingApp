const User = require('../models/user.model');

const getFeedProfiles = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id);

    let genderQuery = {};
    if (currentUser.interestedIn !== 'both') {
      genderQuery.gender = currentUser.interestedIn;
    }

    const profiles = await User.find({
      _id: { 
        $ne: currentUser._id, 
        $nin: [...currentUser.likes, ...currentUser.passes, ...currentUser.matches] 
      },
      ...genderQuery,
      age: { 
        $gte: currentUser.agePreference.min, 
        $lte: currentUser.agePreference.max 
      }
    }).select('-password');

    res.json(profiles);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const swipeUser = async (req, res) => {
  try {
    const { likedUserId, action } = req.body;
    const currentUserId = req.user._id;

    if (currentUserId.toString() === likedUserId) {
      return res.status(400).json({ message: 'You cannot swipe yourself' });
    }

    const currentUser = await User.findById(currentUserId);
    const likedUser = await User.findById(likedUserId);

    if (!likedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (action === 'pass') {
      currentUser.passes.push(likedUserId);
      await currentUser.save();
      return res.json({ message: 'Passed successfully', match: false });
    }

    if (action === 'like' || action === 'superlike') {
      if (!currentUser.likes.includes(likedUserId)) {
        currentUser.likes.push(likedUserId);
        if (action === 'superlike') {
          currentUser.superLikes.push(likedUserId);
        }
        await currentUser.save();
      }

      if (likedUser.likes.includes(currentUserId)) {
        currentUser.matches.push(likedUserId);
        likedUser.matches.push(currentUserId);

        await currentUser.save();
        await likedUser.save();

        return res.json({ message: 'It is a Match!', match: true });
      }
    }

    res.json({ message: 'Swipe recorded successfully', match: false });
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

const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.name = req.body.name || user.name;
    user.bio = req.body.bio !== undefined ? req.body.bio : user.bio;
    user.jobTitle = req.body.jobTitle !== undefined ? req.body.jobTitle : user.jobTitle;
    user.company = req.body.company !== undefined ? req.body.company : user.company;
    user.school = req.body.school !== undefined ? req.body.school : user.school;
    user.livingIn = req.body.livingIn !== undefined ? req.body.livingIn : user.livingIn;
    user.height = req.body.height !== undefined ? req.body.height : user.height;
    user.interests = req.body.interests || user.interests;
    user.images = req.body.images || user.images;
    user.distancePreference = req.body.distancePreference || user.distancePreference;
    user.agePreference = req.body.agePreference || user.agePreference;

    if (req.body.longitude && req.body.latitude) {
      user.location = {
        type: 'Point',
        coordinates: [req.body.longitude, req.body.latitude]
      };
    }

    const updatedUser = await user.save();
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getFeedProfiles,
  swipeUser,
  getMatches,
  updateProfile,
  getProfile,
};