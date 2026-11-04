// ============================================================
// HADEED BY NIAZI - Node.js Backend Server
// ============================================================

require("dotenv").config(); // Single .env file at root of backend/

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const app = express();

// Trust reverse proxy (Render, Heroku, Cloudflare) so express-rate-limit gets real client IP
app.set("trust proxy", 1);

// ─────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────

// Security headers
app.use(helmet());

// CORS - allow frontend
const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "https://hadeedbyniazi.com",
  "https://www.hadeedbyniazi.com",
];
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (Postman, mobile apps)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Body parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Logger (only in development)
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// Rate limiting - prevent brute force
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, message: "Too many requests. Please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", limiter);

// Stricter rate limit on auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: "Too many login attempts. Please try again after 15 minutes." },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────
app.use("/api/auth", require("./routes/auth"));
app.use("/api/products", require("./routes/products"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/users", require("./routes/users"));
app.use("/api/reviews", require("./routes/reviews"));
app.use("/api/contact", require("./routes/contact"));
app.use("/api/admin", require("./routes/admin"));

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Hadeed API is running ✓",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found.` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === "development" ? err.message : "Internal server error.",
  });
});

// ─────────────────────────────────────────────
// MONGODB CONNECTION + ADMIN SEED
// ─────────────────────────────────────────────
async function seedAdmin() {
  const User = require("./models/User");
  const bcrypt = require("bcryptjs");

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME || "Hadeed Admin";

  if (!adminEmail || !adminPassword) {
    console.log("⚠️  ADMIN_EMAIL or ADMIN_PASSWORD not set in .env - skipping admin seed.");
    return;
  }

  const existing = await User.findOne({ email: adminEmail });
  if (!existing) {
    await User.create({
      name: adminName,
      email: adminEmail,
      password: adminPassword, // will be hashed by pre-save hook
      role: "admin",
      phone: "03237655723",
    });
    console.log(`✅ Admin account created: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log("   ⚠️  Change this password after first login!");
  } else if (existing.role !== "admin") {
    // Ensure admin role is correct
    await User.findByIdAndUpdate(existing._id, { role: "admin" });
    console.log(`✅ Admin role restored for: ${adminEmail}`);
  } else {
    console.log(`ℹ️  Admin account already exists: ${adminEmail}`);
  }
}

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: "hadeed_db",
    });
    console.log("✅ MongoDB Atlas connected successfully");
    await seedAdmin();
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log("\n🚀 Hadeed by Niazi Backend");
    console.log(`   Port:        http://localhost:${PORT}`);
    console.log(`   Health:      http://localhost:${PORT}/api/health`);
    console.log(`   Environment: ${process.env.NODE_ENV}`);

    // Print email configuration presence on startup (boolean only, zero secret leakage)
    console.log("\n📧 Email Dispatch Configuration Status:");
    console.log(`   RESEND_API_KEY:            ${Boolean(process.env.RESEND_API_KEY)}`);
    console.log(`   RESEND_FROM_EMAIL:         ${Boolean(process.env.RESEND_FROM_EMAIL)}`);
    console.log(`   ADMIN_NOTIFICATION_EMAIL:  ${Boolean(process.env.ADMIN_NOTIFICATION_EMAIL)}`);
    console.log(`   EMAIL_USER:                ${Boolean(process.env.EMAIL_USER)}`);
    console.log(`   EMAIL_PASS:                ${Boolean(process.env.EMAIL_PASS)}`);

    console.log("\n📌 API Endpoints:");
    console.log("   POST   /api/auth/register");
    console.log("   POST   /api/auth/login");
    console.log("   GET    /api/auth/me");
    console.log("   GET    /api/orders        (admin)");
    console.log("   POST   /api/orders        (place order)");
    console.log("   POST   /api/admin/test-email (admin)");
    console.log("   GET    /api/users         (admin)");
    console.log("   GET    /api/reviews       (public)");
    console.log("   POST   /api/reviews       (submit)");
    console.log("   POST   /api/contact       (submit)");
    console.log("   GET    /api/admin/stats   (admin dashboard)");
    console.log("");
  });
});
