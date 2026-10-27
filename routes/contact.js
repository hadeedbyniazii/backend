const express = require("express");
const router = express.Router();
const Contact = require("../models/Contact");
const { protect, adminOnly, optionalAuth } = require("../middleware/auth");

// ─────────────────────────────────────────────
// POST /api/contact  (public: submit message)
// ─────────────────────────────────────────────
router.post("/", optionalAuth, async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !message) {
      return res.status(400).json({ success: false, message: "Name and message are required." });
    }

    const contactData = {
      name: name.trim(),
      email: email || "",
      phone: phone || "",
      subject: subject || "General Inquiry",
      message: message.trim(),
    };

    if (req.user) contactData.user = req.user._id;

    const contact = await Contact.create(contactData);

    res.status(201).json({
      success: true,
      message: "Message sent! We'll get back to you soon.",
      id: contact._id,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to send message." });
  }
});

// ─────────────────────────────────────────────
// GET /api/contact  (admin: all messages)
// ─────────────────────────────────────────────
router.get("/", protect, adminOnly, async (req, res) => {
  try {
    const { isRead, page = 1, limit = 20 } = req.query;
    const query = {};
    if (isRead !== undefined) query.isRead = isRead === "true";

    const skip = (Number(page) - 1) * Number(limit);
    const [messages, total] = await Promise.all([
      Contact.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Contact.countDocuments(query),
    ]);

    res.json({ success: true, messages, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch messages." });
  }
});

// ─────────────────────────────────────────────
// PUT /api/contact/:id  (admin: mark read / reply)
// ─────────────────────────────────────────────
router.put("/:id", protect, adminOnly, async (req, res) => {
  try {
    const { isRead, adminReply } = req.body;
    const updates = {};
    if (isRead !== undefined) updates.isRead = isRead;
    if (adminReply !== undefined) updates.adminReply = adminReply;

    const msg = await Contact.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!msg) return res.status(404).json({ success: false, message: "Message not found." });

    res.json({ success: true, message: msg });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update message." });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/contact/:id  (admin)
// ─────────────────────────────────────────────
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    await Contact.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Message deleted." });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete message." });
  }
});

module.exports = router;
