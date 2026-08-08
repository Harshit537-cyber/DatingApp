const Admin = require("../models/admin.model");
const User = require("../models/user.model");

const Support = require("../models/support.model");

const bcrypt = require("bcryptjs");

const jwt = require("jsonwebtoken");
const exceljs = require("exceljs");

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

const registerAdmin = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    const adminExists = await Admin.findOne({ $or: [{ email }, { phone }] });
    if (adminExists) {
      return res
        .status(400)
        .json({ message: "Admin with this email or phone already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const admin = await Admin.create({
      name,
      email,
      phone,
      password: hashedPassword,
    });

    if (admin) {
      res.status(201).json({
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        phone: admin.phone,
        role: admin.role,
        token: generateToken(admin._id),
      });
    } else {
      res.status(400).json({ message: "Invalid admin data" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });

    if (admin && (await bcrypt.compare(password, admin.password))) {
      res.status(200).json({
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        phone: admin.phone,
        role: admin.role,
        token: generateToken(admin._id),
      });
    } else {
      res.status(401).json({ message: "Invalid email or password" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ message: "Mobile number is required" });
    }

    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiryTime = new Date(Date.now() + 10 * 60 * 1000);

    let admin = await Admin.findOne({ phone });

    if (!admin) {
      admin = new Admin({
        name: "Admin User",
        email: `${phone}@admin.com`,
        phone: phone,
        password: "defaultpassword123",
      });
    }

    admin.otp = generatedOtp;
    admin.otpExpires = otpExpiryTime;
    await admin.save();

    res.status(200).json({
      message: "OTP sent successfully",
      phone: phone,
      otp: generatedOtp,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res
        .status(400)
        .json({ message: "Mobile number and OTP are required" });
    }

    const admin = await Admin.findOne({ phone });

    if (!admin) {
      return res.status(404).json({ message: "Mobile number not found" });
    }

    if (!admin.otp || admin.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (admin.otpExpires < new Date()) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    admin.otp = null;
    admin.otpExpires = null;
    await admin.save();

    const token = generateToken(admin._id);

    res.status(200).json({
      message: "OTP verified successfully",
      token,
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        phone: admin.phone,
        role: admin.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAdminProfile = async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.id).select("-password");
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }
    res.status(200).json({ admin });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createUserByAdmin = async (req, res) => {
  try {
    const { name, email, password, gender, age } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      gender,
      age: Number(age),
    });

    res.status(201).json({ message: "User created successfully", user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.status(200).json({
      count: users.length,
      users,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateUserByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    if (updates.password) {
      const salt = await bcrypt.genSalt(10);
      updates.password = await bcrypt.hash(updates.password, salt);
    }

    const updatedUser = await User.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "User updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteUserByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await User.findByIdAndDelete(id);
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [totalUsers, totalNewUsers, maleUsers, femaleUsers] =
      await Promise.all([
        User.countDocuments(),
        User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
        User.countDocuments({ gender: { $regex: /^male$/i } }),
        User.countDocuments({ gender: { $regex: /^female$/i } }),
      ]);

    res.status(200).json({
      totalUsers,
      totalNewUsers,
      maleUsers,
      femaleUsers,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isBlocked = !user.isBlocked;
    await user.save();

    res.status(200).json({
      message: `User ${user.isBlocked ? "blocked" : "unblocked"} successfully`,
      isBlocked: user.isBlocked,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getUsersByGender = async (req, res) => {
  try {
    const { gender } = req.params;

    const users = await User.find({
      gender: { $regex: new RegExp(`^${gender}$`, "i") },
    }).select("-password");

    res.status(200).json({
      count: users.length,
      users,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const exportUsersToExcel = async (req, res) => {
  try {
    const users = await User.find().select("-password").lean();

    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet("Users");

    worksheet.columns = [
      { header: "ID", key: "_id", width: 30 },
      { header: "Name", key: "name", width: 25 },
      { header: "Email", key: "email", width: 30 },
      { header: "Gender", key: "gender", width: 15 },
      { header: "Age", key: "age", width: 10 },
      { header: "Status", key: "isBlocked", width: 15 },
      { header: "Created At", key: "createdAt", width: 25 },
    ];

    users.forEach((user) => {
      worksheet.addRow({
        _id: user._id ? user._id.toString() : "",
        name: user.name || "",
        email: user.email || "",
        gender: user.gender || "",
        age: user.age || "",
        isBlocked: user.isBlocked ? "Blocked" : "Active",
        createdAt: user.createdAt
          ? new Date(user.createdAt).toLocaleString()
          : "",
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=users_data.xlsx",
    );

    await workbook.xlsx.write(res);
    res.status(200).end();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getHelpRequests = async (req, res) => {
  try {
    const helpRequests = await Support.find()
      .populate("user", "name email")
      .sort({ createAt: -1 });

    res.status(200).json({
      count: helpRequests.length,
      helpRequests,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const resolveHelpRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const helpRequest = await Support.findByIdAndUpdate(
      id,
      { status: "resolved" },
      { new: true },
    );

    if (!helpRequest) {
      return res.status(404).json({ message: "Help request not found" });
    }
    res.status(200).json({
      message: "Help request resolved successfully",
      helpRequest,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  registerAdmin,
  loginAdmin,
  sendOtp,
  verifyOtp,
  getAdminProfile,
  createUserByAdmin,
  getAllUsers,
  getUserById,
  updateUserByAdmin,
  deleteUserByAdmin,
  getDashboardStats,
  toggleUserStatus,
  getUsersByGender,
  exportUsersToExcel,
  getHelpRequests,
  resolveHelpRequest
};
