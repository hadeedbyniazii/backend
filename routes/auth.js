const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const { protect } = require("../middleware/auth");

// Generate JWT token
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

// Send token response
const sendTokenResponse = (user, statusCode, res) => {
  const token = signToken(user._id);
  res.status(statusCode).json({
    success: true,
    token,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      address: user.address,
      wishlist: user.wishlist,
      createdAt: user.createdAt,
    },
  });
};

// ─────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────
router.post(
  "/register",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().normalizeEmail().withMessage("Valid email required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: errors.array()[0].msg,
          errors: errors.array(),
        });
      }

      const { name, email, password, phone } = req.body;

      // Check if email already exists
      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: "An account with this email already exists.",
        });
      }

      // Create user (role defaults to "user")
      const user = await User.create({ name, email, password, phone: phone || "" });

      user.lastLogin = new Date();
      await user.save({ validateBeforeSave: false });

      sendTokenResponse(user, 201, res);
    } catch (error) {
      console.error("Register error:", error);
      res.status(500).json({ success: false, message: "Server error during registration." });
    }
  }
);

// ─────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────
router.post(
  "/login",
  [
    body("email").isEmail().normalizeEmail().withMessage("Valid email required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: errors.array()[0].msg,
        });
      }

      const { email, password } = req.body;

      // Find user + include password
      const user = await User.findOne({ email }).select("+password");
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password.",
        });
      }

      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          message: "Your account has been deactivated. Please contact support.",
        });
      }

      // Check password
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password.",
        });
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save({ validateBeforeSave: false });

      sendTokenResponse(user, 200, res);
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ success: false, message: "Server error during login." });
    }
  }
);

// ─────────────────────────────────────────────
// GET /api/auth/me  (get current user)
// ─────────────────────────────────────────────
router.get("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// ─────────────────────────────────────────────
// PUT /api/auth/profile  (update own profile)
// ─────────────────────────────────────────────
router.put("/profile", protect, async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    const updates = {};
    if (name) updates.name = name.trim();
    if (phone !== undefined) updates.phone = phone.trim();
    if (address) updates.address = address;

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update profile." });
  }
});

// ─────────────────────────────────────────────
// PUT /api/auth/password  (change own password)
// ─────────────────────────────────────────────
router.put(
  "/password",
  protect,
  [
    body("currentPassword").notEmpty().withMessage("Current password is required"),
    body("newPassword").isLength({ min: 6 }).withMessage("New password must be at least 6 characters"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: errors.array()[0].msg });
      }

      const { currentPassword, newPassword } = req.body;
      const user = await User.findById(req.user._id).select("+password");

      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: "Current password is incorrect." });
      }

      user.password = newPassword;
      await user.save();

      res.json({ success: true, message: "Password changed successfully." });
    } catch (error) {
      res.status(500).json({ success: false, message: "Failed to change password." });
    }
  }
);

// ─────────────────────────────────────────────
// PUT /api/auth/wishlist  (sync wishlist)
// ─────────────────────────────────────────────
router.put("/wishlist", protect, async (req, res) => {
  try {
    const { wishlist } = req.body; // array of product IDs
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { wishlist: Array.isArray(wishlist) ? wishlist : [] },
      { new: true }
    );
    res.json({ success: true, wishlist: user.wishlist });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update wishlist." });
  }
});

module.exports = router;
