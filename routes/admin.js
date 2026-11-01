const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const User = require("../models/User");
const Review = require("../models/Review");
const Contact = require("../models/Contact");
const { protect, adminOnly } = require("../middleware/auth");

// All admin routes require authentication + admin role
router.use(protect, adminOnly);

// ─────────────────────────────────────────────
// GET /api/admin/stats  (dashboard stats)
// ─────────────────────────────────────────────
router.get("/stats", async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const [
      totalOrders,
      totalUsers,
      pendingOrders,
      totalRevenueAgg,
      monthRevenueAgg,
      lastMonthRevenueAgg,
      pendingReviews,
      unreadMessages,
      recentOrders,
      ordersByStatus,
    ] = await Promise.all([
      Order.countDocuments(),
      User.countDocuments({ role: "user" }),
      Order.countDocuments({ status: "pending" }),
      Order.aggregate([{ $group: { _id: null, total: { $sum: "$totalAmount" } } }]),
      Order.aggregate([
        { $match: { createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      Review.countDocuments({ isApproved: false }),
      Contact.countDocuments({ isRead: false }),
      Order.find().sort({ createdAt: -1 }).limit(5).populate("user", "name email"),
      Order.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);

    const totalRevenue = totalRevenueAgg[0]?.total || 0;
    const monthRevenue = monthRevenueAgg[0]?.total || 0;
    const lastMonthRevenue = lastMonthRevenueAgg[0]?.total || 0;
    const revenueGrowth =
      lastMonthRevenue > 0
        ? (((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(1)
        : monthRevenue > 0
        ? 100
        : 0;

    // Orders this month vs last month
    const [thisMonthOrders, lastMonthOrders] = await Promise.all([
      Order.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Order.countDocuments({ createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } }),
    ]);

    res.json({
      success: true,
      stats: {
        totalOrders,
        totalUsers,
        pendingOrders,
        totalRevenue,
        monthRevenue,
        lastMonthRevenue,
        revenueGrowth: Number(revenueGrowth),
        thisMonthOrders,
        lastMonthOrders,
        pendingReviews,
        unreadMessages,
      },
      recentOrders,
      ordersByStatus: ordersByStatus.reduce((acc, s) => {
        acc[s._id] = s.count;
        return acc;
      }, {}),
    });
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch stats." });
  }
});

// ─────────────────────────────────────────────
// GET /api/admin/revenue-chart  (monthly revenue for chart)
// ─────────────────────────────────────────────
router.get("/revenue-chart", async (req, res) => {
  try {
    const months = 6;
    const data = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

      const [revenue, orders] = await Promise.all([
        Order.aggregate([
          { $match: { createdAt: { $gte: start, $lte: end }, status: { $ne: "cancelled" } } },
          { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
        ]),
        Order.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      ]);

      data.push({
        month: start.toLocaleString("en-PK", { month: "short" }),
        year: start.getFullYear(),
        revenue: revenue[0]?.total || 0,
        orders,
      });
    }

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch chart data." });
  }
});

// ─────────────────────────────────────────────
// POST /api/admin/test-email  (test email dispatch)
// ─────────────────────────────────────────────
router.post("/test-email", async (req, res) => {
  try {
    const { sendEmail } = require("../utils/email");
    const recipient = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.EMAIL_USER || "hadeedbyniazii@gmail.com";

    const testHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #111;">
        <h2 style="color: #047857;">Hadeed by Niazi - Email Test</h2>
        <p>This is a test notification from the Hadeed by Niazi backend system.</p>
        <p>Timestamp: <strong>${new Date().toISOString()}</strong></p>
        <p>Environment: <strong>${process.env.NODE_ENV || "production"}</strong></p>
      </div>
    `;

    const result = await sendEmail(
      {
        to: recipient,
        subject: `[Test] Hadeed by Niazi Email Configuration Check (${new Date().toLocaleTimeString()})`,
        html: testHtml,
      },
      true // return provider and error details
    );

    if (result.success) {
      return res.json({
        success: true,
        message: `Test email sent successfully via ${result.provider}`,
        provider: result.provider,
        recipientDomain: recipient.includes("@") ? `@${recipient.split("@")[1]}` : "configured",
      });
    } else {
      return res.status(502).json({
        success: false,
        message: "Email dispatch failed across configured providers",
        provider: result.provider,
        error: result.error,
      });
    }
  } catch (err) {
    console.error("Test email endpoint error:", err.message);
    res.status(500).json({
      success: false,
      message: "Unexpected error testing email dispatch",
      error: err.message,
    });
  }
});

module.exports = router;
