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

// @route   POST /api/products/seed
// @desc    Seed initial 5 products from products.js into MongoDB
// @access  Private/Admin
router.post("/seed", protect, adminOnly, async (req, res) => {
  try {
    const defaultProducts = [
      {
        productId: "chilli-pickle",
        name: "Chilli Pickle",
        urdu: "مرچ کا اچار",
        category: "Pickle",
        color: "#5F6A27",
        dark: "#3B4318",
        tags: ["Tangy", "Spicy", "Traditional"],
        short: "Fresh green chillies, sunflower oil and a blend of traditional spices.",
        desc: "Made with fresh green chillies, sunflower oil, and a blend of traditional spices for an authentic homemade taste.",
        ingredients: ["Fresh green chillies", "Sunflower oil", "Traditional spice blend"],
        sizes: [
          { label: "350 g", price: 650, image: "/products/Chili_Pickle_350ml_-removebg-preview.webp" },
          { label: "1 KG", price: 1450, image: "/products/Chilli_Pickle_1kg-removebg-preview.webp" },
        ],
      },
      {
        productId: "garlic-pickle",
        name: "Garlic Pickle",
        urdu: "لہسن کا اچار",
        category: "Pickle",
        color: "#5B1F73",
        dark: "#3A1049",
        tags: ["Tangy", "Spicy", "Traditional"],
        short: "Fresh garlic cloves slow-cured in sunflower oil and desi masalas.",
        desc: "Made with fresh garlic, sunflower oil, and a blend of traditional spices for an authentic homemade taste.",
        ingredients: ["Fresh garlic", "Sunflower oil", "Traditional spice blend"],
        sizes: [
          { label: "350 g", price: 700, image: "/products/Garlic_Pickle_350_ml-removebg-preview.webp" },
          { label: "1 KG", price: 1550, image: "/products/Garlic_Pickle_1kg-removebg-preview.webp" },
        ],
      },
      {
        productId: "desi-ghee",
        name: "Desi Ghee",
        urdu: "دیسی گھی",
        category: "Ghee",
        color: "#0B1A4A",
        dark: "#060F2E",
        tags: ["Belaona Method", "Pure", "Golden"],
        short: "Churned the age-old Belaona way from fresh curd. Pure, golden, aromatic.",
        desc: "Our ghee is prepared using the traditional Belaona method, where fresh curd is slowly churned to separate pure butter.",
        ingredients: ["Pure desi butter (from fresh curd)"],
        sizes: [
          { label: "350 g", price: 1600, image: "/caps/Desi_Ghee_350ml-removebg-preview.webp" },
          { label: "1 KG", price: 3800, image: "/products/desi_ghee_1kg_-removebg-preview.webp" },
        ],
      },
      {
        productId: "honey-choti-makkhi",
        name: "Honey (Choti Makkhi)",
        urdu: "شہد (چھوٹی مکھی)",
        category: "Honey",
        color: "#8A5A94",
        dark: "#5E3568",
        tags: ["Pure", "Raw", "Natural"],
        short: "Pure & natural jungle honey, collected by bees from wild flowers.",
        desc: "Sourced from the untouched jungles, our honey is 100% pure, raw and natural, collected by bees from wild flowers.",
        ingredients: ["100% pure raw honey"],
        sizes: [
          { label: "500 g", price: 2200, image: "/products/honey_choti_makhi_500ml_-removebg-preview.webp" },
        ],
      },
      {
        productId: "honey-bari-makkhi",
        name: "Honey (Bari Makkhi)",
        urdu: "شہد (بڑی مکھی)",
        category: "Honey",
        color: "#7A2E12",
        dark: "#4E1B09",
        tags: ["Pure", "Raw", "Natural"],
        short: "Bold, rich jungle honey from the big bee – raw and unprocessed.",
        desc: "Sourced from the untouched jungles, our honey is 100% pure, raw and natural, collected by bees from wild flowers.",
        ingredients: ["100% pure raw honey"],
        sizes: [
          { label: "500 g", price: 1800, image: "/products/honey_500ml_-removebg-preview.webp" },
        ],
      },
    ];

    let seededCount = 0;
    for (const p of defaultProducts) {
      const exists = await Product.findOne({ productId: p.productId });
      if (!exists) {
        await Product.create(p);
        seededCount++;
      }
    }

    res.json({
      success: true,
      message: `Seeded ${seededCount} products successfully`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
