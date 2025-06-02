const mongoose = require("mongoose");

const marketBasketSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    analysisDate: {
      type: Date,
      required: true,
    },
    itemsets: [
      {
        items: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
        support: { type: Number, required: true },
      },
    ],
    rules: [
      {
        antecedents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
        consequents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
        confidence: { type: Number, required: true },
        lift: { type: Number, required: true },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("MarketBasket", marketBasketSchema);
