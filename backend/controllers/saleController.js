const fs = require("fs");
const csv = require("fast-csv");
const mongoose = require("mongoose");
const Sale = require("../models/Sale");
const Product = require("../models/Product");
const logger = require("../utils/logger");
const { validationResult } = require("express-validator");

const createSale = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.error(`Validation errors: ${JSON.stringify(errors.array())}`);
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    if (!["Manager", "Admin", "Owner"].includes(req.user.role)) {
      logger.error(`Access denied for user ${req.user.id}`);
      return res.status(403).json({ error: "Access denied" });
    }

    if (mongoose.connection.readyState !== 1) {
      logger.error("MongoDB not connected");
      return res.status(500).json({ error: "Database connection error" });
    }

    const { date, totalAmount, items, promotion } = req.body;

    const saleData = {
      userId: req.user.id,
      date: new Date(date),
      totalAmount: parseFloat(totalAmount),
      items: items.map((item) => ({
        productId: item.productId,
        quantity: parseInt(item.quantity),
        price: parseFloat(item.price),
        promotion: !!item.promotion,
      })),
      promotion: !!promotion,
    };

    const sale = new Sale(saleData);
    await sale.save();

    // Populate productId to include name, matching frontend expectations
    const populatedSale = await Sale.findById(sale._id)
      .populate("items.productId", "name")
      .lean();

    logger.info(`Sale created: ${sale._id} by user ${req.user.id}`);
    res.status(201).json(populatedSale);
  } catch (error) {
    logger.error(`Create sale error: ${error.message}`);
    res.status(500).json({ error: error.message || "Failed to create sale" });
  }
};

const uploadSales = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.file) {
      logger.error("No file uploaded");
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (!["Manager", "Admin", "Owner"].includes(req.user.role)) {
      logger.error(`Access denied for user ${req.user.id}`);
      return res.status(403).json({ error: "Access denied" });
    }

    if (mongoose.connection.readyState !== 1) {
      logger.error("MongoDB not connected");
      return res.status(500).json({ error: "Database connection error" });
    }

    const filePath = req.file.path;
    let rowCount = 0;
    let errorCount = 0;
    const sales = [];

    const csvRows = [];
    const parser = csv.parse({ headers: true, trim: true });

    fs.createReadStream(filePath).pipe(parser);

    for await (const row of parser) {
      csvRows.push(row);
    }

    for (const [index, row] of csvRows.entries()) {
      rowCount = index + 1;

      try {
        logger.debug(`Processing row ${rowCount}: ${JSON.stringify(row)}`);

        let itemsRaw = row.items || "";
        if (typeof itemsRaw !== "string") {
          throw new Error(`Invalid items type: ${typeof itemsRaw}`);
        }

        itemsRaw = itemsRaw.replace(/^"|"$/g, "").replace(/\\"/g, '"');
        let items;
        try {
          items = JSON.parse(itemsRaw);
        } catch (err) {
          throw new Error(`Failed to parse items JSON: ${err.message}`);
        }

        if (!Array.isArray(items) || items.length === 0) {
          throw new Error(`Items is not a non-empty array`);
        }

        for (const item of items) {
          if (
            !item.productId ||
            !mongoose.Types.ObjectId.isValid(item.productId)
          ) {
            throw new Error(`Invalid productId: ${item.productId}`);
          }

          const product = await Product.findById(item.productId).exec();
          if (!product) {
            throw new Error(`Product not found: ${item.productId}`);
          }

          if (!Number.isFinite(item.quantity) || item.quantity < 1) {
            throw new Error(`Invalid quantity: ${item.quantity}`);
          }

          if (!Number.isFinite(item.price) || item.price < 0) {
            throw new Error(`Invalid price: ${item.price}`);
          }
        }

        const saleDate = new Date(row.date);
        if (isNaN(saleDate.getTime())) {
          throw new Error(`Invalid date: ${row.date}`);
        }

        const totalAmount = parseFloat(row.totalAmount);
        if (isNaN(totalAmount) || totalAmount < 0) {
          throw new Error(`Invalid totalAmount: ${row.totalAmount}`);
        }

        const sale = {
          userId: req.user.id,
          date: saleDate,
          totalAmount,
          items: items.map((item) => ({
            productId: item.productId,
            quantity: parseInt(item.quantity),
            price: parseFloat(item.price),
            promotion: !!item.promotion,
          })),
          promotion: items.some((item) => item.promotion === true),
        };

        sales.push(sale);
        logger.info(`Row ${rowCount} passed validation and added to sales`);
      } catch (err) {
        logger.error(`Validation failed for row ${rowCount}: ${err.message}`, {
          row,
        });
        errorCount++;
      }
    }

    if (sales.length === 0) {
      logger.error(
        `No valid sales processed. Total rows: ${rowCount}, errors: ${errorCount}`
      );
      fs.unlinkSync(filePath);
      return res.status(400).json({
        error: `No valid sales processed. ${errorCount} rows failed validation.`,
      });
    }

    await Sale.insertMany(sales);
    logger.info(`Uploaded ${sales.length} sales out of ${rowCount} rows`);
    fs.unlinkSync(filePath);
    res.status(201).json({ message: "Sales uploaded", count: sales.length });
  } catch (err) {
    logger.error(`Upload error: ${err.message}`);
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }
    next(err);
  }
};

const getSales = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      promotion,
      minAmount,
      maxAmount,
      page = 1,
      limit = 10,
    } = req.query;

    const query = { userId: req.user.id };

    if (startDate && endDate) {
      query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    if (promotion !== undefined) {
      query.promotion = promotion === "true";
    }

    if (minAmount || maxAmount) {
      query.totalAmount = {};
      if (minAmount) query.totalAmount.$gte = parseFloat(minAmount);
      if (maxAmount) query.totalAmount.$lte = parseFloat(maxAmount);
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [sales, total] = await Promise.all([
      Sale.find(query)
        .populate("items.productId", "name")
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Sale.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      sales,
      total,
      page: pageNum,
      totalPages,
    });
  } catch (error) {
    logger.error(`Get sales error: ${error.message}`);
    res.status(500).json({ error: "Server error" });
  }
};

const getSale = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id).populate(
      "items.productId",
      "name"
    );
    if (!sale || sale.userId.toString() !== req.user.id) {
      return res.status(404).json({ error: "Sale not found" });
    }
    res.json(sale);
  } catch (error) {
    logger.error(`Get sale error: ${error.message}`);
    res.status(500).json({ error: "Server error" });
  }
};

const updateSale = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale || sale.userId.toString() !== req.user.id) {
      return res.status(404).json({ error: "Sale not found" });
    }

    const { date, totalAmount, items, promotion } = req.body;

    if (date) sale.date = new Date(date);
    if (totalAmount !== undefined) sale.totalAmount = parseFloat(totalAmount);
    if (promotion !== undefined) sale.promotion = !!promotion;
    if (items) {
      sale.items = items.map((item) => ({
        productId: item.productId,
        quantity: parseInt(item.quantity),
        price: parseFloat(item.price),
        promotion: !!item.promotion,
      }));
    }

    await sale.save();
    logger.info(`Sale updated: ${sale._id}`);
    res.json(sale);
  } catch (error) {
    logger.error(`Update sale error: ${error.message}`);
    res.status(500).json({ error: "Server error" });
  }
};

const deleteSale = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale || sale.userId.toString() !== req.user.id) {
      return res.status(404).json({ error: "Sale not found" });
    }

    await sale.deleteOne();
    logger.info(`Sale deleted: ${sale._id}`);
    res.json({ message: "Sale deleted" });
  } catch (error) {
    logger.error(`Delete sale error: ${error.message}`);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  uploadSales,
  getSales,
  getSale,
  updateSale,
  createSale,
  deleteSale,
};
