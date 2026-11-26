const User = require("../models/user.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const cloudinary = require("../config/cloudinary");
const Support = require("../models/support.model");
const { auth } = require("../config/firebase");
const PasswordReset = require("../models/passwordReset.model");
const { sendEmail } = require("../config/email");

const {
  generateOtp,
  hashValue,
  compareHashes,
} = require("../utils/passwordReset");

const generateToken = (id, tokenVersion = 0) => {
  return jwt.sign(
    { id, tokenVersion },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
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
      token: generateToken(user._id, user.tokenVersion),
      isNewUser,
    });

  } catch (error) {
    console.error("❌ Google Auth Verification Failed:", error.message);
    console.log("=========================================================\n");
    res.status(500).json({ message: "Google authentication failed: " + error.message });
  }
};

// ==========================================
// APPLE AUTH CONTROLLER (FIREBASE VERIFICATION)
// ==========================================
// Flow: iOS app -> Apple -> Firebase Auth SDK -> Firebase ID token -> this endpoint.
// We never talk to Apple directly; we only verify the Firebase ID token.
const appleLogin = async (req, res) => {
  try {
    const { idToken, fullName } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: "Firebase ID token is required" });
    }

    // Verify the Firebase ID token, matching the Google sign-in flow.
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(idToken);
    } catch (err) {
      console.error("Apple verifyIdToken failed:", err.code, err.message);
      return res.status(401).json({ message: "Invalid or expired Firebase token" });
    }

    // 2. Make sure this token really came from Sign in with Apple
    if (decodedToken.firebase?.sign_in_provider !== "apple.com") {
      return res.status(401).json({ message: "Token was not issued via Apple sign-in" });
    }

    const appleId = decodedToken.uid;
    const tokenEmail = decodedToken.email ? decodedToken.email.toLowerCase() : null;
    const emailVerified = decodedToken.email_verified === true;
    const email = tokenEmail || `${appleId}@apple.noemail.invalid`;

    const displayName =
      (typeof fullName === "string" && fullName.trim()) ||
      decodedToken.name ||
      email.split("@")[0] ||
      "User";

    let user = await User.findOne({ appleId });
    let isNewUser = false;

    if (!user && tokenEmail && emailVerified) {
      user = await User.findOne({ email: tokenEmail });
      if (user) {
        user.appleId = appleId;
        await user.save();
      }
    }

    if (!user) {
      isNewUser = true;

      const randomPassword = crypto.randomBytes(24).toString("hex");
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(randomPassword, salt);

      try {
        user = await User.create({
          name: displayName,
          email,
          password: hashedPassword,
          appleId,
          authProvider: "apple",
          profilePic: "",
          gender: null,
          interestedIn: null,
          age: null,
          location: { type: "Point", coordinates: [0, 0] },
        });
      } catch (err) {
        // Two simultaneous first-logins: the other request already created the user
        if (err.code === 11000) {
          user = await User.findOne({ appleId });
          isNewUser = false;
          if (!user) throw err;
        } else {
          throw err;
        }
      }
    } else if (!user.gender || !user.age || !user.interestedIn) {
      isNewUser = true; // existing but profile incomplete -> needs onboarding
    }

    if (user.isBanned) {
      return res.status(403).json({ message: "This account has been banned" });
    }

    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      gender: user.gender,
      profilePic: user.profilePic,
      token: generateToken(user._id, user.tokenVersion),
      isNewUser,
    });
  } catch (error) {
    console.error("❌ Apple Auth Failed:", error.message);
    res.status(500).json({ message: "Apple authentication failed: " + error.message });
  }
};

// ==========================================
// FACEBOOK AUTH CONTROLLER (FIREBASE VERIFICATION)
// ==========================================
// Flow: Flutter app -> Facebook SDK -> Firebase Auth SDK -> Firebase ID token -> this endpoint.
// Identity (uid, email, name, picture) is taken ONLY from the verified token,
// never from the request body.
const facebookLogin = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: "Firebase ID token is required" });
    }

    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(idToken);
    } catch (err) {
      console.error("Facebook verifyIdToken failed:", err.code, err.message);
      return res.status(401).json({ message: "Invalid or expired Firebase token" });
    }

    // Make sure this token really came from Facebook sign-in
    if (decodedToken.firebase?.sign_in_provider !== "facebook.com") {
      return res.status(401).json({ message: "Token was not issued via Facebook sign-in" });
    }

    const facebookId = decodedToken.uid;
    const tokenEmail = decodedToken.email ? decodedToken.email.toLowerCase() : null;
    // Facebook may not return an email (phone-only accounts or permission denied)
    const email = tokenEmail || `${facebookId}@facebook.noemail.invalid`;
    const displayName =
      decodedToken.name || (tokenEmail ? tokenEmail.split("@")[0] : "") || "User";
    const picture = decodedToken.picture || "";

    let user = await User.findOne({ facebookId });
    let isNewUser = false;

    if (!user) {
      // Do not silently attach this Facebook login to an existing account that
      // has the same email: Firebase does not mark Facebook emails as verified,
      // so doing so would allow account takeover.
      if (tokenEmail) {
        const emailOwner = await User.findOne({ email: tokenEmail });
        if (emailOwner) {
          return res.status(409).json({
            message:
              "This email is already registered with another sign-in method. Please sign in with that method.",
          });
        }
      }

      isNewUser = true;

      const randomPassword = crypto.randomBytes(24).toString("hex");
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(randomPassword, salt);

      try {
        user = await User.create({
          name: displayName,
          email,
          password: hashedPassword,
          facebookId,
          authProvider: "facebook",
          profilePic: picture,
          gender: null,
          interestedIn: null,
          age: null,
          location: { type: "Point", coordinates: [0, 0] },
        });
      } catch (err) {
        // Two simultaneous first-logins: the other request already created the user
        if (err.code === 11000) {
          user = await User.findOne({ facebookId });
          isNewUser = false;
          if (!user) {
            return res.status(409).json({
              message:
                "This email is already registered with another sign-in method. Please sign in with that method.",
            });
          }
        } else {
          throw err;
        }
      }
    } else if (!user.gender || !user.age || !user.interestedIn) {
      isNewUser = true; // existing but profile incomplete -> needs onboarding
    }

    if (user.isBanned) {
      return res.status(403).json({ message: "This account has been banned" });
    }

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
    console.error("❌ Facebook Auth Failed:", error.message);
    res.status(500).json({ message: "Facebook authentication failed: " + error.message });
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
        token: generateToken(user._id, user.tokenVersion),
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
        token: generateToken(user._id, user.tokenVersion),
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

    // Explicitly strip sensitive and server-managed fields to prevent mass-assignment
    delete updates.password;
    delete updates.email;
    delete updates.spotify;
    delete updates.tokenVersion;
    delete updates.isVerified;
    delete updates.walletBalance;
    delete updates.subscription;
    delete updates.boostsAvailable;
    delete updates.boostUntil;
    delete updates.likes;
    delete updates.passes;
    delete updates.matches;
    delete updates.superLikes;
    delete updates.blockedUsers;
    delete updates.isBanned;
    delete updates.isDeactivated;
    delete updates.deactivateReason;
    delete updates.deactivatedAt;
    delete updates.hostStatus;
    delete updates.isVerifiedHost;
    delete updates.hostApplicationId;
    delete updates.stripeConnectAccountId;
    delete updates.payoutsEnabled;
    delete updates.chargesEnabled;
    delete updates.detailsSubmitted;

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

    // Parse and sanitize favorite artists
    if (updates.favoriteArtists !== undefined) {
      if (typeof updates.favoriteArtists === "string") {
        try {
          updates.favoriteArtists = JSON.parse(updates.favoriteArtists);
        } catch (e) {
          updates.favoriteArtists = updates.favoriteArtists
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean);
        }
      }
      if (!Array.isArray(updates.favoriteArtists)) {
        return res.status(400).json({
          success: false,
          message: "favoriteArtists must be an array or comma-separated string",
        });
      }
      updates.favoriteArtists = updates.favoriteArtists
        .map((a) => String(a).trim())
        .filter(Boolean);
    }

    // Parse and sanitize music genres
    if (updates.musicGenres !== undefined) {
      if (typeof updates.musicGenres === "string") {
        try {
          updates.musicGenres = JSON.parse(updates.musicGenres);
        } catch (e) {
          updates.musicGenres = updates.musicGenres
            .split(",")
            .map((g) => g.trim())
            .filter(Boolean);
        }
      }
      if (!Array.isArray(updates.musicGenres)) {
        return res.status(400).json({
          success: false,
          message: "musicGenres must be an array or comma-separated string",
        });
      }
      updates.musicGenres = updates.musicGenres
        .map((g) => String(g).trim())
        .filter(Boolean);
    }

    // Parse, validate, and normalize anthem song
    if (updates.anthemSong !== undefined) {
      if (updates.anthemSong === null || updates.anthemSong === "" || updates.anthemSong === "null") {
        updates.anthemSong = null;
      } else {
        let anthemObj = updates.anthemSong;
        if (typeof anthemObj === "string") {
          try {
            anthemObj = JSON.parse(anthemObj);
          } catch (e) {
            return res.status(400).json({
              success: false,
              message: "Invalid anthemSong JSON format",
            });
          }
        }

        if (typeof anthemObj !== "object" || anthemObj === null) {
          return res.status(400).json({
            success: false,
            message: "anthemSong must be an object",
          });
        }

        const id = anthemObj.id || anthemObj.trackId;
        const name = anthemObj.name;
        const artist = anthemObj.artist;

        if (!id || !name || !artist) {
          return res.status(400).json({
            success: false,
            message: "Anthem song requires id, name, and artist",
          });
        }

        const albumName = anthemObj.albumName || anthemObj.album || "";
        const albumArtUrl = anthemObj.albumArtUrl || anthemObj.imageUrl || "";
        const spotifyUrl = anthemObj.spotifyUrl || anthemObj.externalUrl || "";
        const uri = anthemObj.uri || (id ? `spotify:track:${id}` : "");

        updates.anthemSong = {
          id: String(id).trim(),
          name: String(name).trim(),
          artist: String(artist).trim(),
          albumName: String(albumName).trim(),
          albumArtUrl: String(albumArtUrl).trim(),
          spotifyUrl: String(spotifyUrl).trim(),
          uri: String(uri).trim(),
          // Legacy backward-compatibility aliases
          trackId: String(id).trim(),
          album: String(albumName).trim(),
          imageUrl: String(albumArtUrl).trim(),
          externalUrl: String(spotifyUrl).trim(),
        };
      }
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updates, {
      new: true,
      runValidators: true,
    }).select("-password");

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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


const forgotPassword = async (req, res) => {
  try {
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    const user = await User.findOne({ email });

    // Do not reveal whether an account exists.
    const genericResponse = {
      success: true,
      message:
        "If an account exists with this email, a password-reset OTP will be sent.",
    };

    if (!user) {
      return res.status(200).json(genericResponse);
    }

    // Check resend cooldown.
    const existingReset = await PasswordReset.findOne({
      user: user._id,
    });

    const cooldownMs = 60 * 1000;

    if (
      existingReset?.otpSentAt &&
      Date.now() - existingReset.otpSentAt.getTime() < cooldownMs
    ) {
      return res.status(200).json(genericResponse);
    }

    // Generate OTP and hash it.
    const otp = generateOtp();
    const otpHash = hashValue(otp);

    const now = new Date();
    const otpExpiresAt = new Date(now.getTime() + 10 * 60 * 1000);

    // Save only the hashed OTP.
    await PasswordReset.findOneAndUpdate(
      { user: user._id },
      {
        $set: {
          otpHash,
          otpExpiresAt,
          otpSentAt: now,
          otpAttempts: 0,
          resetTokenHash: null,
          resetTokenExpiresAt: null,
          expiresAt: otpExpiresAt,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    try {
      await sendEmail({
        to: user.email,
        subject: "Dating App - Password Reset OTP",
        text: `Your password-reset OTP is ${otp}. It expires in 10 minutes. If you did not request this, please ignore this email.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto;">
            <h2>Password Reset Request</h2>
            <p>Use the following OTP to verify your email address:</p>
            <h1 style="letter-spacing: 6px;">${otp}</h1>
            <p>This OTP expires in <strong>10 minutes</strong>.</p>
            <p>If you did not request a password reset, you can ignore this email.</p>
          </div>
        `,
      });
    } catch (emailError) {
      // Do not leave an unusable OTP active if delivery fails.
      await PasswordReset.updateOne(
        { user: user._id, otpHash },
        {
          $unset: {
            otpHash: 1,
            otpExpiresAt: 1,
            otpSentAt: 1,
          },
        }
      );

      console.error("Password-reset email delivery failed:", emailError);

      return res.status(200).json(genericResponse);
    }

    return res.status(200).json(genericResponse);
  } catch (error) {
    console.error("Forgot password error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later.",
    });
  }
};

// verify the reset otp

const verifyResetOtp = async (req, res) => {
  try {
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    const otp =
      typeof req.body.otp === "string"
        ? req.body.otp.trim()
        : "";

    // Validate input
    if (!email || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "A valid email and 6-digit OTP are required.",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP.",
      });
    }

    // Explicitly select otpHash because the schema uses select: false.
    const resetRecord = await PasswordReset.findOne({
      user: user._id,
    }).select("+otpHash");

    if (!resetRecord || !resetRecord.otpHash) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP.",
      });
    }

    const MAX_ATTEMPTS = 5;
    const now = new Date();

    // Check attempt limit
    if (resetRecord.otpAttempts >= MAX_ATTEMPTS) {
      return res.status(429).json({
        success: false,
        message: "Maximum OTP attempts exceeded. Please request a new OTP.",
      });
    }

    // Check expiry
    if (
      !resetRecord.otpExpiresAt ||
      resetRecord.otpExpiresAt <= now
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP.",
      });
    }

    // Compare submitted OTP with stored HMAC hash.
    const submittedOtpHash = hashValue(otp);
    const isValidOtp = compareHashes(
      submittedOtpHash,
      resetRecord.otpHash
    );

    if (!isValidOtp) {
      // Increment attempts atomically.
      const updatedRecord = await PasswordReset.findOneAndUpdate(
        {
          _id: resetRecord._id,
          otpAttempts: { $lt: MAX_ATTEMPTS },
          otpHash: resetRecord.otpHash,
        },
        {
          $inc: { otpAttempts: 1 },
        },
        { returnDocument: "after" }
      );

      if (!updatedRecord || updatedRecord.otpAttempts >= MAX_ATTEMPTS) {
        return res.status(429).json({
          success: false,
          message:
            "Maximum OTP attempts exceeded. Please request a new OTP.",
        });
      }

      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP.",
        attemptsRemaining: MAX_ATTEMPTS - updatedRecord.otpAttempts,
      });
    }

    // Generate a cryptographically secure, single-use reset token.
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = hashValue(resetToken);

    // Reset token expires in 10 minutes.
    const resetTokenExpiresAt = new Date(
      now.getTime() + 10 * 60 * 1000
    );

    // Atomically consume OTP and issue reset token.
    const updatedRecord = await PasswordReset.findOneAndUpdate(
      {
        _id: resetRecord._id,
        otpHash: resetRecord.otpHash,
        otpExpiresAt: { $gt: now },
        otpAttempts: { $lt: MAX_ATTEMPTS },
      },
      {
        $set: {
          otpHash: null,
          otpExpiresAt: null,
          resetTokenHash,
          resetTokenExpiresAt,
          expiresAt: resetTokenExpiresAt,
        },
      },
      { returnDocument: "after" }
    );

    if (!updatedRecord) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP. Please request a new OTP.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully.",
      resetToken,
      expiresIn: 600,
    });
  } catch (error) {
    console.error("Verify reset OTP error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later.",
    });
  }
};

// Reset password using the verified reset token
const resetPassword = async (req, res) => {
  let session;

  try {
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    const resetToken =
      typeof req.body.resetToken === "string"
        ? req.body.resetToken.trim()
        : "";

    const newPassword =
      typeof req.body.newPassword === "string"
        ? req.body.newPassword
        : "";

    // 1. Validate request data
    if (!email || !resetToken || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email, reset token and new password are required.",
      });
    }

    // The token generated by verifyResetOtp is 64 hex characters.
    if (!/^[a-f0-9]{64}$/i.test(resetToken)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token.",
      });
    }

    // Password policy: minimum 8 characters, maximum 128.
    if (newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({
        success: false,
        message: "Password must be between 8 and 128 characters.",
      });
    }

    // 2. Find the account
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token.",
      });
    }

    // 3. Hash the submitted reset token and check its validity.
    const resetTokenHash = hashValue(resetToken);
    const now = new Date();

    const resetRecord = await PasswordReset.findOne({
      user: user._id,
      resetTokenHash,
      resetTokenExpiresAt: { $gt: now },
    }).select("+resetTokenHash");

    if (!resetRecord) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token.",
      });
    }

    // 4. Hash the new password using the same convention as registration.
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // 5. Update password and consume token atomically.
    session = await User.startSession();

    await session.withTransaction(async () => {
      // Only one concurrent request can successfully consume this token.
      const consumedToken = await PasswordReset.findOneAndDelete(
        {
          _id: resetRecord._id,
          user: user._id,
          resetTokenHash,
          resetTokenExpiresAt: { $gt: new Date() },
        },
        { session }
      );

      if (!consumedToken) {
        throw new Error("RESET_TOKEN_INVALID");
      }

      const updatedUser = await User.updateOne(
        { _id: user._id },
        {
          $set: { password: hashedPassword },
          $inc: { tokenVersion: 1 },
        },
        { session }
      );

      if (updatedUser.matchedCount !== 1) {
        throw new Error("USER_NOT_FOUND");
      }
    });

    return res.status(200).json({
      success: true,
      message: "Password reset successfully. You can now log in with your new password.",
    });

  } catch (error) {
    if (error.message === "RESET_TOKEN_INVALID") {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token.",
      });
    }

    if (error.message === "USER_NOT_FOUND") {
      return res.status(400).json({
        success: false,
        message: "Unable to reset password. Please try again.",
      });
    }

    console.error("Reset password error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later.",
    });

  } finally {
    if (session) {
      await session.endSession();
    }
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
  appleLogin,
  facebookLogin,
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
  forgotPassword,
  verifyResetOtp,
  resetPassword,
};