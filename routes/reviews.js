const express = require("express");
const router = express.Router();
const Review = require("../models/Review");
const { protect, adminOnly, optionalAuth } = require("../middleware/auth");

// ─────────────────────────────────────────────
// GET /api/reviews  (public: approved reviews)
// ─────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { productId, limit = 20, all } = req.query;
    const query = {};

    // Only show approved reviews to public
    // Admin can pass ?all=true with auth to see all
    if (!all) query.isApproved = true;
    if (productId) query.productId = productId;

    const reviews = await Review.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    res.json({ success: true, reviews, count: reviews.length });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch reviews." });
  }
});

// ─────────────────────────────────────────────
// GET /api/reviews/admin  (admin: all reviews)
// ─────────────────────────────────────────────
router.get("/admin/all", protect, adminOnly, async (req, res) => {
  try {
    const { approved, page = 1, limit = 20 } = req.query;
    const query = {};
    if (approved !== undefined) query.isApproved = approved === "true";

    const skip = (Number(page) - 1) * Number(limit);
    const [reviews, total] = await Promise.all([
      Review.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Review.countDocuments(query),
    ]);

    res.json({ success: true, reviews, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch reviews." });
  }
});

// ─────────────────────────────────────────────
// POST /api/reviews  (public: submit review)
// ─────────────────────────────────────────────
router.post("/", optionalAuth, async (req, res) => {
  try {
    const { name, city, productId, productName, stars, text } = req.body;

    if (!name || !stars || !text) {
      return res.status(400).json({ success: false, message: "Name, rating, and review text are required." });
    }

    const reviewData = {
      name: name.trim(),
      city: city || "",
      productId: productId || "",
      productName: productName || "",
      stars: Number(stars),
      text: text.trim(),
      isApproved: false, // needs admin approval
    };

    if (req.user) {
      reviewData.user = req.user._id;
      reviewData.name = req.user.name; // Use real name for logged-in users
    }

    const review = await Review.create(reviewData);

    res.status(201).json({
      success: true,
      message: "Thank you! Your review has been submitted and will appear after approval.",
      review,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to submit review." });
  }
});

// ─────────────────────────────────────────────
// PUT /api/reviews/:id  (admin: approve/reject)
// ─────────────────────────────────────────────
router.put("/:id", protect, adminOnly, async (req, res) => {
  try {
    const { isApproved, isVerifiedPurchase } = req.body;
    const updates = {};
    if (isApproved !== undefined) updates.isApproved = isApproved;
    if (isVerifiedPurchase !== undefined) updates.isVerifiedPurchase = isVerifiedPurchase;

    const review = await Review.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found." });
    }

    res.json({ success: true, review });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update review." });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/reviews/:id  (admin)
// ─────────────────────────────────────────────
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found." });
    }
    res.json({ success: true, message: "Review deleted." });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete review." });
  }
});

module.exports = router;
