const mongoose = require("mongoose");

const sizeSchema = new mongoose.Schema({
  label: { type: String, required: true },
  price: { type: Number, required: true },
  image: { type: String, default: "" },
  inStock: { type: Boolean, default: true }
});

const productSchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    urdu: {
      type: String,
      default: "",
    },
    category: {
      type: String,
      required: true,
      enum: ["Ghee", "Pickle", "Honey", "Other"],
      default: "Other",
    },
    color: {
      type: String,
      default: "#0B1A4A",
    },
    dark: {
      type: String,
      default: "#060F2E",
    },
    tags: [{ type: String }],
    short: {
      type: String,
      default: "",
    },
    desc: {
      type: String,
      default: "",
    },
    ingredients: [{ type: String }],
    storage: {
      type: String,
      default: "Keep in a cool, dry place away from direct sunlight.",
    },
    sizes: [sizeSchema],
    isFeatured: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
