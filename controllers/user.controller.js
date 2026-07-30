const User = require("../models/user.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cloudinary = require("../config/cloudinary");

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

const registerUser = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      gender,
      interestedIn,
      age,
      bio,
      jobTitle,
      company,
      school,
      livingIn,
      height,
      longitude,
      latitude,
      distancePreference,
      agePreference,
      interests,
      lifestyle,
      languages,
    } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    let profilePicUrl = "";
    const additionalPhotoUrls = [];

    if (req.files) {
      if (req.files.profilePic && req.files.profilePic.length > 0) {
        const file = req.files.profilePic[0];
        const b64 = Buffer.from(file.buffer).toString("base64");
        const dataURI = "data:" + file.mimetype + ";base64," + b64;
        const result = await cloudinary.uploader.upload(dataURI, {
          folder: "users",
        });
        profilePicUrl = result.secure_url;
      }

      if (req.files.additionalPhotos && req.files.additionalPhotos.length > 0) {
        for (const file of req.files.additionalPhotos) {
          const b64 = Buffer.from(file.buffer).toString("base64");
          const dataURI = "data:" + file.mimetype + ";base64," + b64;
          const result = await cloudinary.uploader.upload(dataURI, {
            folder: "users",
          });
          additionalPhotoUrls.push(result.secure_url);
        }
      }
    }

    if (!profilePicUrl) {
      return res.status(400).json({ message: "Profile picture is required" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    let parsedAgePreference;
    if (agePreference) {
      try {
        parsedAgePreference =
          typeof agePreference === "string"
            ? JSON.parse(agePreference)
            : agePreference;
      } catch (e) {
        parsedAgePreference = undefined;
      }
    }

    let parsedInterests = [];
    if (interests) {
      try {
        parsedInterests =
          typeof interests === "string" ? JSON.parse(interests) : interests;
      } catch (e) {
        parsedInterests =
          typeof interests === "string" ? interests.split(",") : [];
      }
    }

    let parsedLifestyle = [];
    if (lifestyle) {
      try {
        parsedLifestyle =
          typeof lifestyle === "string" ? JSON.parse(lifestyle) : lifestyle;
      } catch (e) {
        parsedLifestyle =
          typeof lifestyle === "string" ? lifestyle.split(",") : [];
      }
    }

    let parsedLanguages = [];
    if (languages) {
      try {
        parsedLanguages =
          typeof languages === "string" ? JSON.parse(languages) : languages;
      } catch (e) {
        parsedLanguages =
          typeof languages === "string" ? languages.split(",") : [];
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
      lifestyle: parsedLifestyle,
      languages: parsedLanguages,
      profilePic: profilePicUrl,
      additionalPhotos: additionalPhotoUrls,
      location: {
        type: "Point",
        coordinates: [Number(longitude) || 0, Number(latitude) || 0],
      },
      distancePreference: distancePreference ? Number(distancePreference) : 50,
      ...(parsedAgePreference && { agePreference: parsedAgePreference }),
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
      res.status(400).json({ message: "Invalid user data" });
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
      res.status(401).json({ message: "Invalid email or password" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    await User.findByIdAndDelete(userId);

    res.status(200).json({
      message: "Account deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const deactivateAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        message: "Please provide reason for deactivating account",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    user.isDeactivated = true;
    user.deactivateReason = reason;
    user.deactivatedAt = new Date();

    await user.save();

    res.status(200).json({
      message: "Account deactivated successfully",
      reason: user.deactivateReason,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const getProfileById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select("-password");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.status(200).json({
      message: "Profile fetched successfully",
      user,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const activateAccount = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    user.isDeactivated = false;
    user.deactivateReason = null;
    user.deactivatedAt = null;

    await user.save();

    res.status(200).json({
      message: "Account activated successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const hideProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { days } = req.body;

    const allowedDays = [1, 7, 30];

    if (!allowedDays.includes(Number(days))) {
      return res.status(400).json({
        message: "Please select only 1, 7 or 30 days",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const hideUntil = new Date();
    hideUntil.setDate(hideUntil.getDate() + Number(days));

    user.isProfileHidden = true;
    user.profileHiddenUntil = hideUntil;

    await user.save();

    res.status(200).json({
      message: `Profile hidden for ${days} days`,
      profileHiddenUntil: user.profileHiddenUntil,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const unhideProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    user.isProfileHidden = false;
    user.profileHiddenUntil = null;

    await user.save();

    res.status(200).json({
      message: "Profile unhidden successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const updates = { ...req.body };

    delete updates.password;
    delete updates.email;

    if (req.files) {
      if (req.files.profilePic && req.files.profilePic.length > 0) {
        const file = req.files.profilePic[0];
        const b64 = Buffer.from(file.buffer).toString("base64");
        const dataURI = "data:" + file.mimetype + ";base64," + b64;
        const result = await cloudinary.uploader.upload(dataURI, {
          folder: "users",
        });
        updates.profilePic = result.secure_url;
      }

      if (req.files.additionalPhotos && req.files.additionalPhotos.length > 0) {
        const additionalPhotoUrls = [];
        for (const file of req.files.additionalPhotos) {
          const b64 = Buffer.from(file.buffer).toString("base64");
          const dataURI = "data:" + file.mimetype + ";base64," + b64;
          const result = await cloudinary.uploader.upload(dataURI, {
            folder: "users",
          });
          additionalPhotoUrls.push(result.secure_url);
        }
        updates.additionalPhotos = additionalPhotoUrls;
      }
    }

    if (updates.interests) {
      try {
        updates.interests =
          typeof updates.interests === "string"
            ? JSON.parse(updates.interests)
            : updates.interests;
      } catch (e) {
        updates.interests =
          typeof updates.interests === "string"
            ? updates.interests.split(",")
            : updates.interests;
      }
    }

    if (updates.lifestyle) {
      try {
        updates.lifestyle =
          typeof updates.lifestyle === "string"
            ? JSON.parse(updates.lifestyle)
            : updates.lifestyle;
      } catch (e) {
        updates.lifestyle =
          typeof updates.lifestyle === "string"
            ? updates.lifestyle.split(",")
            : updates.lifestyle;
      }
    }

    if (updates.languages) {
      try {
        updates.languages =
          typeof updates.languages === "string"
            ? JSON.parse(updates.languages)
            : updates.languages;
      } catch (e) {
        updates.languages =
          typeof updates.languages === "string"
            ? updates.languages.split(",")
            : updates.languages;
      }
    }

    if (updates.agePreference) {
      try {
        updates.agePreference =
          typeof updates.agePreference === "string"
            ? JSON.parse(updates.agePreference)
            : updates.agePreference;
      } catch (e) {}
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updates, {
      new: true,
      runValidators: true,
    }).select("-password");

    res.status(200).json({
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  updateProfile,
  deleteAccount,
  deactivateAccount,
  activateAccount,
  getProfileById,
  hideProfile,
  unhideProfile,
};