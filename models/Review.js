const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    name: { type: String, required: true, trim: true },
    city: { type: String, default: "", trim: true },
    productId: { type: String, default: "" }, // empty = general review
    productName: { type: String, default: "" },
    stars: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, required: true, maxlength: 1000 },
    isApproved: { type: Boolean, default: false }, // admin approves
    isVerifiedPurchase: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Review", reviewSchema);
