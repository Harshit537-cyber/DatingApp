const User = require('../models/user.model');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cloudinary = require('../config/cloudinary');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

const registerUser = async (req, res) => {
  try {
    const { 
      name, email, password, gender, interestedIn, 
      age, bio, jobTitle, company, school, livingIn, 
      height, longitude, latitude, distancePreference, 
      agePreference, interests 
    } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    let profilePicUrl = '';
    const additionalPhotoUrls = [];

    if (req.files) {
      if (req.files.profilePic && req.files.profilePic.length > 0) {
        const file = req.files.profilePic[0];
        const b64 = Buffer.from(file.buffer).toString('base64');
        const dataURI = "data:" + file.mimetype + ";base64," + b64;
        const result = await cloudinary.uploader.upload(dataURI, { folder: 'users' });
        profilePicUrl = result.secure_url;
      }

      if (req.files.additionalPhotos && req.files.additionalPhotos.length > 0) {
        for (const file of req.files.additionalPhotos) {
          const b64 = Buffer.from(file.buffer).toString('base64');
          const dataURI = "data:" + file.mimetype + ";base64," + b64;
          const result = await cloudinary.uploader.upload(dataURI, { folder: 'users' });
          additionalPhotoUrls.push(result.secure_url);
        }
      }
    }

    if (!profilePicUrl) {
      return res.status(400).json({ message: 'Profile picture is required' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    let parsedAgePreference;
    if (agePreference) {
       try { 
         parsedAgePreference = typeof agePreference === 'string' ? JSON.parse(agePreference) : agePreference; 
       } catch (e) { 
         parsedAgePreference = undefined; 
       }
    }

    let parsedInterests = [];
    if (interests) {
       try { 
         parsedInterests = typeof interests === 'string' ? JSON.parse(interests) : interests; 
       } catch (e) { 
         parsedInterests = typeof interests === 'string' ? interests.split(',') : []; 
       }
    }

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      gender,
      interestedIn,
      age: Number(age),
      bio,
      jobTitle,
      company,
      school,
      livingIn,
      height: height ? Number(height) : null,
      interests: parsedInterests,
      profilePic: profilePicUrl,
      additionalPhotos: additionalPhotoUrls,
      location: {
        type: 'Point',
        coordinates: [Number(longitude) || 0, Number(latitude) || 0]
      },
      distancePreference: distancePreference ? Number(distancePreference) : 50,
      ...(parsedAgePreference && { agePreference: parsedAgePreference })
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        gender: user.gender,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (user && (await bcrypt.compare(password, user.password))) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
};