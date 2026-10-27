const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { protect, adminOnly } = require("../middleware/auth");

// ─────────────────────────────────────────────
// GET /api/users  (admin: all users)
// ─────────────────────────────────────────────
router.get("/", protect, adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role } = req.query;
    const query = {};

    if (role) query.role = role;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [users, total] = await Promise.all([
      User.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      User.countDocuments(query),
    ]);

    res.json({
      success: true,
      users,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch users." });
  }
});

// ─────────────────────────────────────────────
// GET /api/users/:id  (admin)
// ─────────────────────────────────────────────
router.get("/:id", protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch user." });
  }
});

// ─────────────────────────────────────────────
// PUT /api/users/:id  (admin: update user role/status)
// ─────────────────────────────────────────────
router.put("/:id", protect, adminOnly, async (req, res) => {
  try {
    const { role, isActive, name, phone } = req.body;
    const updates = {};

    // Prevent demoting self
    if (req.params.id === String(req.user._id) && role && role !== "admin") {
      return res.status(400).json({ success: false, message: "You cannot change your own role." });
    }

    if (role) updates.role = role;
    if (isActive !== undefined) updates.isActive = isActive;
    if (name) updates.name = name.trim();
    if (phone !== undefined) updates.phone = phone;

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update user." });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/users/:id  (admin)
// ─────────────────────────────────────────────
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    if (req.params.id === String(req.user._id)) {
      return res.status(400).json({ success: false, message: "You cannot delete your own account." });
    }

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    res.json({ success: true, message: "User deleted." });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete user." });
  }
});

module.exports = router;
