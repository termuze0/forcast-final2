export interface Forecast {
  id: string;
  userId: string;
  period: "Daily" | "Weekly" | "Monthly";
  model: "ARIMA" | "RandomForest";
  startDate: string;
  endDate: string;
  predictions: {
    date: string;
    predictedValue: number;
    confidence: number;
    confidenceUpper: number;
    confidenceLower: number;
  }[];
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
}

export interface ForecastRequest {
  forecastPeriod: "Daily" | "Weekly" | "Monthly";
  modelType: "ARIMA" | "RandomForest";
  startDate: string;
  endDate: string;
}

export interface ForecastsResponse {
  forecasts: Forecast[];
  total: number;
  page: number;
  totalPages: number;
}
