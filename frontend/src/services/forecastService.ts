import api from "./api";
import type {
  Forecast,
  ForecastRequest,
  ForecastsResponse,
} from "../types/forecast";

interface BackendForecast {
  _id: string;
  userId: string;
  predictions?: {
    // Make predictions optional
    date: string;
    predictedSales: number;
    confidenceLevel: number;
    confidenceUpper: number;
    confidenceLower: number;
  }[];
  forecastPeriod: "Daily" | "Weekly" | "Monthly";
  modelType: "ARIMA" | "RandomForest";
  startDate: string;
  endDate: string;
  features: {
    seasonality: string;
    promotion: boolean;
    laggedSales: number;
    economicTrend: string;
  };
  metrics: {
    rmse: number;
    mae: number;
    mape: number;
  };
  alert: {
    isActive: boolean;
    message: string;
  };
  createdAt: string;
  updatedAt: string;
  __v: number;
}

export const forecastService = {
  getForecasts: async (params?: {
    forecastPeriod?: string;
    page?: number;
    limit?: number;
  }): Promise<ForecastsResponse> => {
    try {
      const response = await api.get<any>("/forecasts", {
        params,
      });
      const validForecasts = response.data.forecasts
        .filter((item: BackendForecast) => {
          if (!item.predictions || !Array.isArray(item.predictions)) {
            console.warn(
              `Invalid forecast: _id=${item._id}, predictions is ${item.predictions}`
            );
            return false;
          }
          return true;
        })
        .map((item: BackendForecast) => ({
          id: item._id,
          userId: item.userId,
          period: item.forecastPeriod,
          model: item.modelType,
          startDate: item.startDate,
          endDate: item.endDate,
          predictions: item.predictions!.map((pred) => ({
            date: pred.date,
            predictedValue: pred.predictedSales,
            confidence: pred.confidenceLevel,
            confidenceUpper: pred.confidenceUpper,
            confidenceLower: pred.confidenceLower,
          })),
          features: item.features,
          metrics: item.metrics,
          alert: item.alert,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        }));

      if (validForecasts.length === 0 && response.data.forecasts.length > 0) {
        console.warn("All forecasts were invalid; returning empty list");
      }

      return {
        forecasts: validForecasts,
        total: response.data.total,
        page: response.data.page,
        totalPages: response.data.totalPages,
      };
    } catch (error: any) {
      console.error("Error fetching forecasts:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        requestParams: params,
      });
      if (error.response?.status === 401) {
        throw new Error("Unauthorized: Please log in again");
      }
      if (error.response?.status === 403) {
        throw new Error("Forbidden: Insufficient permissions");
      }
      throw new Error(
        error.response?.data?.error || "Failed to fetch forecasts"
      );
    }
  },

  generateForecast: async (data: ForecastRequest): Promise<Forecast> => {
    try {
      const response = await api.post<BackendForecast>(
        "/forecasts/generate",
        data
      );
      const item = response.data;
      if (!item.predictions || !Array.isArray(item.predictions)) {
        console.error(
          `Generated forecast has invalid predictions: _id=${item._id}`
        );
        throw new Error("Invalid forecast data: predictions missing");
      }
      return {
        id: item._id,
        userId: item.userId,
        period: item.forecastPeriod,
        model: item.modelType,
        startDate: item.startDate,
        endDate: item.endDate,
        predictions: item.predictions.map((pred) => ({
          date: pred.date,
          predictedValue: pred.predictedSales,
          confidence: pred.confidenceLevel,
          confidenceUpper: pred.confidenceUpper,
          confidenceLower: pred.confidenceLower,
        })),
        features: item.features,
        metrics: item.metrics,
        alert: item.alert,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    } catch (error: any) {
      console.error(
        "Error generating forecast:",
        error.message,
        error.response?.data
      );
      throw new Error(
        error.response?.data?.error || "Failed to generate forecast"
      );
    }
  },
};
