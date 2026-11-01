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

// Auto-generate order number before saving with collision-proof retry logic
orderSchema.pre("save", async function (next) {
  if (!this.orderNumber) {
    const OrderModel = mongoose.model("Order");
    // Find highest existing HD-XXXX number or fallback to count
    let nextNum = 1;
    const latestOrder = await OrderModel.findOne({ orderNumber: /^HD-\d+$/ })
      .sort({ createdAt: -1, _id: -1 })
      .select("orderNumber");

    if (latestOrder && latestOrder.orderNumber) {
      const match = latestOrder.orderNumber.match(/^HD-(\d+)$/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    } else {
      const count = await OrderModel.countDocuments();
      nextNum = count + 1;
    }

    // Ensure uniqueness even if an order was deleted or duplicate exists
    let candidate = `HD-${String(nextNum).padStart(4, "0")}`;
    while (await OrderModel.exists({ orderNumber: candidate })) {
      nextNum++;
      candidate = `HD-${String(nextNum).padStart(4, "0")}`;
    }

    this.orderNumber = candidate;
  }
  next();
});

module.exports = mongoose.model("Order", orderSchema);
