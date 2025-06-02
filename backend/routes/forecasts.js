const express = require("express");
const router = express.Router();
const { check } = require("express-validator");
const auth = require("../middleware/auth");
const role = require("../middleware/role");
const forecastController = require("../controllers/forecastController");

/**
 * @swagger
 * /api/forecasts/generate:
 *   post:
 *     summary: Generate a new forecast
 *     tags: [Forecasts]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               forecastPeriod: { type: string, enum: ['Daily', 'Weekly', 'Monthly'] }
 *               modelType: { type: string, enum: ['ARIMA', 'RandomForest'] }
 *               startDate: { type: string, format: date }
 *               endDate: { type: string, format: date }
 *     responses:
 *       201: { description: Forecast generated successfully }
 *       400: { description: Validation error }
 *       403: { description: Unauthorized access }
 */
router.post(
  "/generate",
  auth,
  role("Manager", "Admin", "Owner"),
  [
    check("forecastPeriod", "Valid period is required").isIn([
      "Daily",
      "Weekly",
      "Monthly",
    ]),
    check("modelType", "Valid model is required").isIn([
      "ARIMA",
      "RandomForest",
    ]),
    check("startDate", "Valid start date is required").isISO8601(),
    check("endDate", "Valid end date is required").isISO8601(),
  ],
  forecastController.generateForecast
);

/**
 * @swagger
 * /api/forecasts:
 *   get:
 *     summary: Retrieve all forecasts
 *     tags: [Forecasts]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of forecasts retrieved successfully }
 *       403: { description: Unauthorized access }
 */
router.get(
  "/",
  auth,
  role("Manager", "Admin", "Owner"),
  forecastController.listForecasts
);

/**
 * @swagger
 * /api/forecasts/updateSettings:
 *   put:
 *     summary: Update forecast settings
 *     tags: [Forecasts]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               features:
 *                 type: object
 *                 properties:
 *                   seasonality: { type: string }
 *                   economicTrend: { type: string }
 *     responses:
 *       200: { description: Forecast settings updated successfully }
 *       400: { description: Validation error }
 *       403: { description: Unauthorized access }
 */
router.put(
  "/updateSettings",
  auth,
  role("Admin", "Owner"),
  [
    check("features.seasonality", "Valid seasonality is required")
      .optional()
      .notEmpty(),
    check("features.economicTrend", "Valid trend is required")
      .optional()
      .notEmpty(),
  ],
  forecastController.updateForecastSettings
);

/**
 * @swagger
 * /api/forecasts/retrain:
 *   post:
 *     summary: Retrain a forecast model
 *     tags: [Forecasts]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               forecastPeriod: { type: string, enum: ['Daily', 'Weekly', 'Monthly'] }
 *               modelType: { type: string, enum: ['ARIMA', 'RandomForest'] }
 *               startDate: { type: string, format: date }
 *               endDate: { type: string, format: date }
 *     responses:
 *       200: { description: Forecast model retrained successfully }
 *       400: { description: Validation error }
 *       403: { description: Unauthorized access }
 */
router.post(
  "/retrain",
  auth,
  role("Admin", "Owner"),
  [
    check("forecastPeriod", "Valid period is required")
      .optional()
      .isIn(["Daily", "Weekly", "Monthly"]),
    check("modelType", "Valid model is required")
      .optional()
      .isIn(["ARIMA", "RandomForest"]),
    check("startDate", "Valid start date is required").isISO8601(),
    check("endDate", "Valid end date is required").isISO8601(),
  ],
  forecastController.retrainForecast
);

module.exports = router;
