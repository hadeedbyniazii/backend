const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const { protect, adminOnly } = require("../middleware/auth");

// @route   GET /api/products
// @desc    Get all active products (public)
// @access  Public
router.get("/", async (req, res) => {
  try {
    const products = await Product.find({ isActive: true }).sort({ createdAt: 1 });
    res.json({
      success: true,
      count: products.length,
      products,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/products/all
// @desc    Get all products including inactive (admin only)
// @access  Private/Admin
router.get("/all", protect, adminOnly, async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: 1 });
    res.json({
      success: true,
      count: products.length,
      products,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/products
// @desc    Create a new product
// @access  Private/Admin
router.post("/", protect, adminOnly, async (req, res) => {
  try {
    const {
      name,
      urdu,
      category,
      color,
      dark,
      tags,
      short,
      desc,
      ingredients,
      storage,
      heritageTitle,
      heritageText,
      images,
      sizes,
      isFeatured,
      isActive,
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: "Product name is required" });
    }

    const productId = req.body.productId || name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    const existing = await Product.findOne({ productId });
    if (existing) {
      return res.status(400).json({ success: false, message: "A product with this ID or name already exists" });
    }

    const product = await Product.create({
      productId,
      name,
      urdu: urdu || "",
      category: category || "Other",
      color: color || "#0B1A4A",
      dark: dark || "#060F2E",
      tags: Array.isArray(tags) ? tags : typeof tags === "string" ? tags.split(",").map(t => t.trim()) : [],
      short: short || "",
      desc: desc || "",
      ingredients: Array.isArray(ingredients) ? ingredients : typeof ingredients === "string" ? ingredients.split(",").map(i => i.trim()) : [],
      storage: storage || "Keep in a cool, dry place.",
      heritageTitle: heritageTitle || "",
      heritageText: heritageText || "",
      images: Array.isArray(images) ? images : [],
      sizes: sizes || [{ label: "Default", price: 1000 }],
      isFeatured: isFeatured !== undefined ? isFeatured : true,
      isActive: isActive !== undefined ? isActive : true,
    });

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      product,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/products/:id
// @desc    Update a product
// @access  Private/Admin
router.put("/:id", protect, adminOnly, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    res.json({
      success: true,
      message: "Product updated successfully",
      product,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/products/:id
// @desc    Delete a product
// @access  Private/Admin
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    res.json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
