const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  productId: { type: String, default: "" },
  name: { type: String, default: "Item" },
  urdu: { type: String, default: "" },
  size: { type: String, default: "Standard" },
  price: { type: Number, default: 0 },
  quantity: { type: Number, default: 1 },
  image: { type: String, default: "" },
  category: { type: String, default: "" },
});

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // null = guest order
    },
    // Customer info (for guest orders too)
    customerName: { type: String, default: "Guest Customer", trim: true },
    customerPhone: { type: String, default: "", trim: true },
    customerEmail: { type: String, trim: true, default: "" },

    // Shipping address
    address: {
      street: { type: String, default: "" },
      city: { type: String, default: "" },
      province: { type: String, default: "" },
      postalCode: { type: String, default: "" },
    },

    // Items
    items: [orderItemSchema],

    // Pricing
    subtotal: { type: Number, default: 0 },
    deliveryCharge: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },

    // Payment
    paymentMethod: {
      type: String,
      enum: ["COD"],
      default: "COD",
    },

    // Status
    status: {
      type: String,
      enum: ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"],
      default: "pending",
    },

    // Notes
    customerNote: { type: String, default: "" },
    adminNote: { type: String, default: "" },

    // Tracking
    trackingNumber: { type: String, default: "" },
    courier: { type: String, default: "" },

    // Source
    source: {
      type: String,
      enum: ["website", "whatsapp", "phone"],
      default: "website",
    },
  },
  {
    timestamps: true,
  }
);

// Auto-generate order number before saving
orderSchema.pre("save", async function (next) {
  if (!this.orderNumber) {
    const count = await mongoose.model("Order").countDocuments();
    this.orderNumber = `HD-${String(count + 1).padStart(4, "0")}`;
  }
  next();
});

module.exports = mongoose.model("Order", orderSchema);
