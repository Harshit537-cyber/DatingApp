const User = require("../models/user.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cloudinary = require("../config/cloudinary");
const Support = require("../models/support.model");
const { auth } = require("../config/firebase");

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

const parseAgePreference = (input) => {
  if (!input) return { min: 18, max: 80 };
  if (typeof input === "object") return input;

  try {
    return JSON.parse(input);
  } catch (e) {
    if (typeof input === "string") {
      if (input.includes("-")) {
        const [min, max] = input.split("-").map(Number);
        return { min: min || 18, max: max || 80 };
      }
      if (input.includes("+")) {
        const min = parseInt(input);
        return { min: min || 50, max: 100 };
      }
    }
  }
  return { min: 18, max: 80 };
};

// ==========================================
// GOOGLE AUTH CONTROLLER (FIREBASE VERIFICATION)
// ==========================================
const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;
    
    console.log("\n=================== GOOGLE AUTH START ===================");
    console.log("👉 Google Auth API call received!");
    console.log("👉 Received Token:", idToken ? "Exists (Token passed)" : "Empty");

    if (!idToken) {
      console.log("❌ Error: No ID Token found in request body");
      return res.status(400).json({ message: "Firebase ID token is required" });
    }

    // 1. Verify token with Firebase Admin SDK
    console.log("🔄 Verifying token with Firebase Admin SDK...");
    const decodedToken = await auth.verifyIdToken(idToken);
    const { email, name, picture } = decodedToken;
    console.log("✅ Token verified successfully! User Info:", { Name: name, Email: email });

    // 2. Check Database for user
    let user = await User.findOne({ email });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      console.log("👤 New user detected! Creating a new database record...");
      
      const randomPassword = Math.random().toString(36).slice(-10);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(randomPassword, salt);

      user = await User.create({
        name: name || "User",
        email,
        password: hashedPassword,
        profilePic: picture || "",
        gender: null,
        interestedIn: null,
        age: null,
        location: {
          type: "Point",
          coordinates: [0, 0],
        },
      });
      console.log("🆕 New user registered in MongoDB with ID:", user._id);
    } else {
      console.log("🔄 Existing user found in MongoDB with ID:", user._id);
      if (!user.gender || !user.age || !user.interestedIn) {
        isNewUser = true;
        console.log("⚠️ Existing profile is incomplete (requires onboarding).");
      }
    }

    console.log("🚀 Response sent to Frontend successfully!");
    console.log("==================== GOOGLE AUTH END ====================\n");

    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      gender: user.gender,
      profilePic: user.profilePic,
      token: generateToken(user._id),
      isNewUser,
    });

  } catch (error) {
    console.error("❌ Google Auth Verification Failed:", error.message);
    console.log("=========================================================\n");
    res.status(500).json({ message: "Google authentication failed: " + error.message });
  }
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
      distancePreference: distancePreference ? Number(distancePreference) : 25,
      agePreference: parseAgePreference(agePreference),
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
      return res.status(404).json({ message: "User not found" });
    }

    await User.findByIdAndDelete(userId);

    res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
      return res.status(404).json({ message: "User not found" });
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
    res.status(500).json({ message: error.message });
  }
};

const getProfileById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "Profile fetched successfully",
      user,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const activateAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isDeactivated = false;
    user.deactivateReason = null;
    user.deactivatedAt = null;

    await user.save();

    res.status(200).json({ message: "Account activated successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
      return res.status(404).json({ message: "User not found" });
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
    res.status(500).json({ message: error.message });
  }
};

const unhideProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isProfileHidden = false;
    user.profileHiddenUntil = null;

    await user.save();

    res.status(200).json({ message: "Profile unhidden successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
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

    if (updates.longitude !== undefined && updates.latitude !== undefined) {
      updates.location = {
        type: "Point",
        coordinates: [Number(updates.longitude), Number(updates.latitude)],
      };
      delete updates.longitude;
      delete updates.latitude;
    }

    if (updates.distancePreference) {
      updates.distancePreference = Number(updates.distancePreference);
    }

    if (updates.agePreference) {
      updates.agePreference = parseAgePreference(updates.agePreference);
    }

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

const submitHelpRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { subject, message, category } = req.body;

    if (!subject || !message) {
      return res.status(400).json({
        message: "Subject and message are required",
      });
    }

    const helpRequest = await Support.create({
      user: userId,
      subject,
      message,
      category,
    });

    res.status(201).json({
      message: "Help request submitted successfully",
      helpRequest,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getUserHelpRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    const helpRequests = await Support.find({ user: userId }).sort({ createdAt: -1 });

    res.status(200).json({
      message: "Help requests fetched successfully",
      count: helpRequests.length,
      helpRequests,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getHelpRequestById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const helpRequest = await Support.findOne({ _id: id, user: userId });

    if (!helpRequest) {
      return res.status(404).json({ message: "Help request not found" });
    }

    res.status(200).json({
      message: "Help request fetched successfully",
      helpRequest,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAllUsersCount = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    res.status(200).json({
      success: true,
      totalUsers,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  googleLogin,
  getMe,
  updateProfile,
  deleteAccount,
  deactivateAccount,
  activateAccount,
  getProfileById,
  hideProfile,
  unhideProfile,
  submitHelpRequest,
  getUserHelpRequests,
  getHelpRequestById,
  getAllUsersCount,
};