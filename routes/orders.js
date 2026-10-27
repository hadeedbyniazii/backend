const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const Order = require("../models/Order");
const { protect, adminOnly, optionalAuth } = require("../middleware/auth");

// ─────────────────────────────────────────────
// POST /api/orders  (place an order)
// ─────────────────────────────────────────────
router.post(
  "/",
  optionalAuth,
  async (req, res) => {
    try {
      const rawBody = req.body;
      const customerName = rawBody.customerName || rawBody.shippingAddress?.fullName || "Valued Customer";
      const customerPhone = rawBody.customerPhone || rawBody.shippingAddress?.phone || "";
      const customerEmail = rawBody.customerEmail || rawBody.shippingAddress?.email || "";
      const address = rawBody.address || {
        street: rawBody.shippingAddress?.address || "",
        city: rawBody.shippingAddress?.city || "Pakistan",
        province: rawBody.shippingAddress?.province || "",
        postalCode: rawBody.shippingAddress?.postalCode || "",
      };
      const items = (rawBody.items || []).map(it => ({
        productId: it.productId || it.id || "item",
        name: it.name || "Product",
        size: it.size || "1 KG",
        price: Number(it.price) || 0,
        quantity: Number(it.quantity || it.qty) || 1,
        image: it.image || "",
        category: it.category || "",
      }));

      // Calculate totals
      const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const deliveryCharge = rawBody.deliveryCharge !== undefined ? rawBody.deliveryCharge : (subtotal > 3500 ? 0 : 250);
      const totalAmount = rawBody.totalAmount || (subtotal + deliveryCharge);

      const orderData = {
        orderNumber: rawBody.orderNumber || undefined,
        customerName,
        customerPhone,
        customerEmail: customerEmail || "",
        address,
        items,
        subtotal,
        deliveryCharge,
        totalAmount,
        customerNote: rawBody.customerNote || rawBody.shippingAddress?.notes || "",
        source: "website",
      };

      // Link to user if logged in
      if (req.user) {
        orderData.user = req.user._id;
      }

      const order = await Order.create(orderData);

      res.status(201).json({
        success: true,
        message: "Order placed successfully!",
        order: {
          _id: order._id,
          orderNumber: order.orderNumber,
          status: order.status,
          totalAmount: order.totalAmount,
          createdAt: order.createdAt,
        },
      });
    } catch (error) {
      console.error("Order error:", error);
      res.status(500).json({ success: false, message: "Failed to place order." });
    }
  }
);

// ─────────────────────────────────────────────
// GET /api/orders/track/:query (public order track)
// ─────────────────────────────────────────────
router.get("/track/:query", async (req, res) => {
  try {
    const raw = req.params.query.trim().replace(/^#/, ""); // remove leading #
    const digitsOnly = raw.replace(/\D/g, "");

    // Search by orderNumber (with or without #), phone number, or partial order #
    const order = await Order.findOne({
      $or: [
        { orderNumber: { $regex: raw, $options: "i" } },
        { orderNumber: { $regex: `^#?${raw}$`, $options: "i" } },
        ...(digitsOnly.length >= 7 ? [
          { customerPhone: { $regex: digitsOnly.slice(-10) } },
          { customerPhone: raw }
        ] : []),
      ],
    }).sort({ createdAt: -1 });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "No order found with this Order Number or Phone. Please check and try again.",
      });
    }

    // Return safe tracking info
    res.json({
      success: true,
      order: {
        orderNumber: order.orderNumber,
        status: order.status,
        customerName: order.customerName,
        city: order.address?.city,
        items: order.items,
        totalAmount: order.totalAmount,
        deliveryCharge: order.deliveryCharge,
        paymentMethod: order.paymentMethod,
        trackingNumber: order.trackingNumber,
        courier: order.courier,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Tracking lookup failed." });
  }
});

// ─────────────────────────────────────────────
// GET /api/orders/my  (get own orders)
// ─────────────────────────────────────────────
router.get("/my", protect, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .select("-adminNote");
    res.json({ success: true, orders, count: orders.length });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch orders." });
  }
});

// ─────────────────────────────────────────────
// GET /api/orders  (admin: all orders)
// ─────────────────────────────────────────────
router.get("/", protect, adminOnly, async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;
    const query = {};

    if (status) query.status = status;
    if (search) {
      query.$or = [
        { orderNumber: { $regex: search, $options: "i" } },
        { customerName: { $regex: search, $options: "i" } },
        { customerPhone: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [orders, total] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("user", "name email"),
      Order.countDocuments(query),
    ]);

    res.json({
      success: true,
      orders,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch orders." });
  }
});

// ─────────────────────────────────────────────
// GET /api/orders/:id  (admin or own order)
// ─────────────────────────────────────────────
router.get("/:id", protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate("user", "name email phone");
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    // Allow if admin OR own order
    if (req.user.role !== "admin" && String(order.user?._id) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch order." });
  }
});

// ─────────────────────────────────────────────
// PUT /api/orders/:id  (admin: update order)
// ─────────────────────────────────────────────
router.put("/:id", protect, adminOnly, async (req, res) => {
  try {
    const { status, adminNote, trackingNumber, courier } = req.body;
    const updates = {};
    if (status) updates.status = status;
    if (adminNote !== undefined) updates.adminNote = adminNote;
    if (trackingNumber !== undefined) updates.trackingNumber = trackingNumber;
    if (courier !== undefined) updates.courier = courier;

    const order = await Order.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update order." });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/orders/:id  (admin only)
// ─────────────────────────────────────────────
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }
    res.json({ success: true, message: "Order deleted." });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete order." });
  }
});

module.exports = router;
