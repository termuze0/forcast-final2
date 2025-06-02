const { validationResult } = require("express-validator");
const Sale = require("../models/Sale");
const Forecast = require("../models/Forecast");
const { PythonShell } = require("python-shell");
const logger = require("../utils/logger");

const executePythonScript = async (
  salesData,
  forecastPeriod,
  modelType,
  startDate,
  endDate,
  maxRetries = 3
) => {
  const options = {
    mode: "text",
    pythonPath: "python",
    pythonOptions: ["-u"],
    scriptPath: "./scripts",
    args: [
      JSON.stringify(salesData),
      forecastPeriod,
      modelType,
      startDate,
      endDate,
    ],
  };

  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Python script timed out after 30 seconds"));
        }, 30000);

        const shell = new PythonShell("forecast.py", options);
        let output = "";
        let errorOutput = "";

        shell.on("message", (message) => {
          if (message.trim().startsWith("{") && message.trim().endsWith("}")) {
            output = message;
          }
        });

        shell.on("stderr", (stderr) => {
          errorOutput += stderr + "\n";
        });

        shell.on("close", () => {
          clearTimeout(timeout);
          if (errorOutput) {
            try {
              const parsedError = JSON.parse(errorOutput);
              if (parsedError.error) {
                return reject(new Error(parsedError.error));
              }
            } catch {
              // Ignore non-JSON stderr unless it contains a valid error
            }
          }
          if (!output) {
            return reject(new Error("Empty response from Python script"));
          }
          try {
            const parsed = JSON.parse(output.trim());
            if (parsed.error) {
              return reject(new Error(parsed.error));
            }
            resolve(parsed);
          } catch (parseErr) {
            reject(
              new Error(
                `Invalid output format: ${parseErr.message}, Output: ${output}`
              )
            );
          }
        });

        shell.on("error", (err) => {
          clearTimeout(timeout);
          reject(new Error(`Python error: ${err.message}`));
        });
      });
      return result;
    } catch (error) {
      attempt++;
      logger.warn(`Python script attempt ${attempt} failed: ${error.message}`);
      if (attempt === maxRetries) {
        throw error;
      }
      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
};

const generateForecast = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { forecastPeriod, modelType, startDate, endDate } = req.body;

  try {
    // Validate inputs
    if (!startDate || !endDate) {
      logger.error("Missing startDate or endDate");
      return res
        .status(400)
        .json({ error: "startDate and endDate are required" });
    }
    if (!["Daily", "Weekly", "Monthly"].includes(forecastPeriod)) {
      logger.error(`Invalid forecastPeriod: ${forecastPeriod}`);
      return res.status(400).json({ error: "Invalid forecast period" });
    }
    if (!["ARIMA", "RandomForest"].includes(modelType)) {
      logger.error(`Invalid modelType: ${modelType}`);
      return res.status(400).json({ error: "Invalid model type" });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      logger.error(
        `Invalid date format: startDate=${startDate}, endDate=${endDate}`
      );
      return res.status(400).json({ error: "Invalid date format" });
    }
    if (start >= end) {
      logger.error("startDate is not before endDate");
      return res
        .status(400)
        .json({ error: "startDate must be before endDate" });
    }

    // Fetch historical sales
    const sales = await Sale.find({
      userId: req.user.id,
      date: {
        $gte: new Date(
          start.getFullYear() - 1,
          start.getMonth(),
          start.getDate()
        ),
      },
    })
      .sort({ date: 1 })
      .lean();

    if (sales.length < 10) {
      logger.error(`Insufficient sales data: ${sales.length} records`);
      return res.status(400).json({
        error: "At least 10 sales records are required for forecasting",
      });
    }

    // Prepare data
    const salesData = sales.map((sale) => ({
      date: sale.date.toISOString().split("T")[0],
      totalAmount: sale.totalAmount,
      promotion: !!sale.promotion,
    }));

    // Execute Python script with retries
    const result = await executePythonScript(
      salesData,
      forecastPeriod,
      modelType,
      startDate,
      endDate
    );

    // Validate Python output
    if (!Array.isArray(result.predictions) || result.predictions.length === 0) {
      logger.error("Python script returned empty or invalid predictions");
      return res.status(500).json({ error: "Invalid forecast predictions" });
    }

    // Format predictions
    const formattedPredictions = result.predictions.map((pred) => {
      const predDate = new Date(pred.date);
      if (isNaN(predDate.getTime())) {
        throw new Error(`Invalid prediction date: ${pred.date}`);
      }
      return {
        date: predDate,
        predictedSales: Number(pred.predictedSales) || 0,
        confidenceLevel: Number(pred.confidenceLevel) || 0,
        confidenceUpper:
          Number(pred.confidenceUpper) || Number(pred.predictedSales) * 1.1,
        confidenceLower:
          Number(pred.confidenceLower) || Number(pred.predictedSales) * 0.9,
      };
    });

    // Save forecast
    const forecast = new Forecast({
      userId: req.user.id,
      predictions: formattedPredictions,
      forecastPeriod,
      modelType,
      startDate: start,
      endDate: end,
      features: {
        seasonality: result.features?.seasonality || "None",
        promotion: !!result.features?.promotion,
        laggedSales: Number(result.features?.laggedSales) || 0,
        economicTrend: result.features?.economicTrend || "Stable",
      },
      metrics: {
        rmse: Number(result.metrics?.rmse) || 0,
        mae: Number(result.metrics?.mae) || 0,
        mape: Number(result.metrics?.mape) || 0,
      },
      alert: {
        isActive: (Number(result.metrics?.mape) || 0) > 20,
        message:
          (Number(result.metrics?.mape) || 0) > 20
            ? "High prediction error"
            : "",
      },
    });

    await forecast.save();
    logger.info(`Forecast generated: ${forecast._id}`);
    res.status(201).json(forecast);
  } catch (error) {
    logger.error(`Forecast generation failed: ${error.message}`);
    res
      .status(500)
      .json({ error: `Failed to generate forecast: ${error.message}` });
  }
};

const listForecasts = async (req, res) => {
  try {
    const { forecastPeriod, page = 1, limit = 10 } = req.query;

    const query = { userId: req.user.id };
    if (forecastPeriod) {
      if (!["Daily", "Weekly", "Monthly"].includes(forecastPeriod)) {
        logger.error(`Invalid forecastPeriod: ${forecastPeriod}`);
        return res.status(400).json({ error: "Invalid forecast period" });
      }
      query.forecastPeriod = forecastPeriod;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    if (isNaN(pageNum) || isNaN(limitNum) || pageNum < 1 || limitNum < 1) {
      logger.error(`Invalid page or limit: page=${page}, limit=${limit}`);
      return res.status(400).json({ error: "Invalid page or limit" });
    }
    const skip = (pageNum - 1) * limitNum;

    const [forecasts, total] = await Promise.all([
      Forecast.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Forecast.countDocuments(query),
    ]);

    logger.info(`Forecasts found: ${forecasts.length}, Total: ${total}`);
    res.json({
      forecasts,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    logger.error(`List forecasts error: ${error.message}`);
    res
      .status(500)
      .json({ error: `Failed to list forecasts: ${error.message}` });
  }
};

const updateForecastSettings = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { features } = req.body;

  try {
    const forecasts = await Forecast.find({ userId: req.user.id });
    if (!forecasts.length) {
      logger.error(`No forecasts found for user: ${req.user.id}`);
      return res.status(404).json({ error: "No forecasts found" });
    }

    // Validate features
    const validFeatures = [
      "seasonality",
      "promotion",
      "laggedSales",
      "economicTrend",
    ];
    const invalidFeatures = Object.keys(features || {}).filter(
      (key) => !validFeatures.includes(key)
    );
    if (invalidFeatures.length) {
      logger.error(`Invalid feature keys: ${invalidFeatures.join(", ")}`);
      return res
        .status(400)
        .json({ error: `Invalid feature keys: ${invalidFeatures.join(", ")}` });
    }

    // Update forecasts
    await Forecast.updateMany(
      { userId: req.user.id },
      { $set: { features: { ...forecasts[0].features, ...features } } }
    );

    logger.info(`Forecast settings updated for user: ${req.user.id}`);
    res.json({ message: "Forecast settings updated" });
  } catch (error) {
    logger.error(`Update forecast settings error: ${error.message}`);
    res
      .status(500)
      .json({ error: `Failed to update settings: ${error.message}` });
  }
};

const retrainForecast = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    forecastPeriod = "Monthly",
    modelType = "RandomForest",
    startDate,
    endDate,
  } = req.body;

  try {
    // Validate inputs
    if (!startDate || !endDate) {
      logger.error("Missing startDate or endDate");
      return res
        .status(400)
        .json({ error: "startDate and endDate are required" });
    }
    if (!["Daily", "Weekly", "Monthly"].includes(forecastPeriod)) {
      logger.error(`Invalid forecastPeriod: ${forecastPeriod}`);
      return res.status(400).json({ error: "Invalid forecast period" });
    }
    if (!["ARIMA", "RandomForest"].includes(modelType)) {
      logger.error(`Invalid modelType: ${modelType}`);
      return res.status(400).json({ error: "Invalid model type" });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      logger.error(
        `Invalid date format: startDate=${startDate}, endDate=${endDate}`
      );
      return res.status(400).json({ error: "Invalid date format" });
    }
    if (start >= end) {
      logger.error("startDate is not before endDate");
      return res
        .status(400)
        .json({ error: "startDate must be before endDate" });
    }

    // Fetch recent sales
    const sales = await Sale.find({
      userId: req.user.id,
      date: {
        $gte: new Date(
          start.getFullYear() - 1,
          start.getMonth(),
          start.getDate()
        ),
      },
    })
      .sort({ date: -1 })
      .limit(1000)
      .lean();

    if (sales.length < 10) {
      logger.error(`Insufficient sales data: ${sales.length} records`);
      return res.status(400).json({
        error: "At least 10 sales records are required for retraining",
      });
    }

    // Prepare data
    const salesData = sales.map((sale) => ({
      date: sale.date.toISOString().split("T")[0],
      totalAmount: sale.totalAmount,
      promotion: !!sale.promotion,
    }));

    // Execute Python script with retries
    const result = await executePythonScript(
      salesData,
      forecastPeriod,
      modelType,
      startDate,
      endDate
    );

    // Validate Python output
    if (!Array.isArray(result.predictions) || result.predictions.length === 0) {
      logger.error("Python script returned empty or invalid predictions");
      return res.status(500).json({ error: "Invalid forecast predictions" });
    }

    // Format predictions
    const formattedPredictions = result.predictions.map((pred) => {
      const predDate = new Date(pred.date);
      if (isNaN(predDate.getTime())) {
        throw new Error(`Invalid prediction date: ${pred.date}`);
      }
      return {
        date: predDate,
        predictedSales: Number(pred.predictedSales) || 0,
        confidenceLevel: Number(pred.confidenceLevel) || 0,
        confidenceUpper:
          Number(pred.confidenceUpper) || Number(pred.predictedSales) * 1.1,
        confidenceLower:
          Number(pred.confidenceLower) || Number(pred.predictedSales) * 0.9,
      };
    });

    // Save forecast
    const forecast = new Forecast({
      userId: req.user.id,
      predictions: formattedPredictions,
      forecastPeriod,
      modelType,
      startDate: start,
      endDate: end,
      features: {
        seasonality: result.features?.seasonality || "None",
        promotion: !!result.features?.promotion,
        laggedSales: Number(result.features?.laggedSales) || 0,
        economicTrend: result.features?.economicTrend || "Stable",
      },
      metrics: {
        rmse: Number(result.metrics?.rmse) || 0,
        mae: Number(result.metrics?.mae) || 0,
        mape: Number(result.metrics?.mape) || 0,
      },
      alert: {
        isActive: (Number(result.metrics?.mape) || 0) > 20,
        message:
          (Number(result.metrics?.mape) || 0) > 20
            ? "High prediction error"
            : "",
      },
    });

    await forecast.save();
    logger.info(`Forecast retrained: ${forecast._id}`);
    res.status(201).json(forecast);
  } catch (error) {
    logger.error(`Retrain forecast error: ${error.message}`);
    res
      .status(500)
      .json({ error: `Failed to retrain forecast: ${error.message}` });
  }
};

module.exports = {
  generateForecast,
  listForecasts,
  updateForecastSettings,
  retrainForecast,
};
