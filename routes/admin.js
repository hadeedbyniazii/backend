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

module.exports = router;
