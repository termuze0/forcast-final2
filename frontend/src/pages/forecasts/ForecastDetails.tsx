import { useMemo } from "react";
import { format, parseISO, isValid } from "date-fns";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { Badge } from "../../components/ui/Badge";
import { Separator } from "../../components/ui/Separator";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/Card";
import { useAuth } from "../../context/AuthContext";
import type { Forecast } from "../../types/forecast";

// Register Chart.js components
ChartJS.register(
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Title,
  Tooltip,
  Legend
);

interface ForecastDetailsProps {
  forecast: Forecast | null;
}

const ForecastDetails = ({ forecast }: ForecastDetailsProps) => {
  const { user } = useAuth();
  const isAuthorized = ["Manager", "Admin", "Owner"].includes(user?.role || "");

  if (!isAuthorized) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive">
          Access denied: Insufficient permissions
        </p>
      </div>
    );
  }

  if (!forecast || !forecast.predictions?.length) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No forecast data available</p>
      </div>
    );
  }

  const chartData = useMemo(() => {
    return forecast.predictions
      .map((prediction, index) => {
        try {
          const parsedDate = parseISO(prediction.date);
          if (!isValid(parsedDate)) {
            console.warn(
              `Invalid date in prediction ${index}: ${prediction.date}`
            );
            return null;
          }
          return {
            date: format(parsedDate, "MMM dd"),
            Predicted: prediction.predictedValue,
            Upper: prediction.confidenceUpper,
            Lower: prediction.confidenceLower,
            Confidence: prediction.confidence,
          };
        } catch (error) {
          console.warn(`Error parsing date in prediction ${index}: ${error}`);
          return null;
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [forecast.predictions]);

  const chartConfig = {
    type: "line" as const,
    data: {
      labels: chartData.map((item) => item.date),
      datasets: [
        {
          label: "Predicted Sales",
          data: chartData.map((item) => item.Predicted),
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59, 130, 246, 0.2)",
          fill: false,
          tension: 0.4,
        },
        {
          label: "Confidence Upper",
          data: chartData.map((item) => item.Upper),
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.1)",
          fill: {
            target: "Confidence Lower",
            above: "rgba(16, 185, 129, 0.1)",
            below: "rgba(16, 185, 129, 0.1)",
          },
          tension: 0.4,
          borderDash: [5, 5],
        },
        {
          label: "Confidence Lower",
          data: chartData.map((item) => item.Lower),
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.1)",
          fill: false,
          tension: 0.4,
          borderDash: [5, 5],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: "category",
          title: { display: true, text: "Date" },
          grid: { display: false },
        },
        y: {
          title: { display: true, text: "Sales ($)" },
          beginAtZero: true,
          ticks: {
            callback: (value: number) => `$${value.toFixed(0)}`,
          },
        },
      },
      plugins: {
        legend: { position: "top" as const },
        tooltip: {
          callbacks: {
            label: (context: any) => {
              const dataset = context.dataset.label;
              const value = context.parsed.y;
              return `${dataset}: $${value.toFixed(2)}`;
            },
          },
        },
      },
    },
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <h4 className="font-medium text-muted-foreground">Period</h4>
          <p className="text-lg">
            <Badge variant="outline">{forecast.period}</Badge>
          </p>
        </div>
        <div>
          <h4 className="font-medium text-muted-foreground">Model</h4>
          <p className="text-lg">{forecast.model}</p>
        </div>
        <div>
          <h4 className="font-medium text-muted-foreground">
            Confidence Level
          </h4>
          <p className="text-lg font-semibold">
            {forecast.predictions[0]?.confidence
              ? `${forecast.predictions[0].confidence.toFixed(1)}%`
              : "N/A"}
          </p>
        </div>
        <div>
          <h4 className="font-medium text-muted-foreground">Created</h4>
          <p>
            {forecast.createdAt
              ? format(parseISO(forecast.createdAt), "MMM dd, yyyy")
              : "N/A"}
          </p>
        </div>
      </div>

      <div>
        <h4 className="font-medium mb-2">Date Range</h4>
        <p>
          From{" "}
          <span className="font-medium">
            {forecast.startDate
              ? format(parseISO(forecast.startDate), "MMMM dd, yyyy")
              : "N/A"}
          </span>{" "}
          to{" "}
          <span className="font-medium">
            {forecast.endDate
              ? format(parseISO(forecast.endDate), "MMMM dd, yyyy")
              : "N/A"}
          </span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Forecast Visualization</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <div className="h-80">
              <Line
                data={chartConfig.data}
                options={chartConfig.options as any}
              />
            </div>
          ) : (
            <div className="h-80 flex items-center justify-center">
              <p className="text-muted-foreground">
                No valid prediction data available
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Features and Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">Features</h4>
              <ul className="space-y-1 text-sm">
                <li>
                  <strong>Seasonality:</strong>{" "}
                  {forecast.features?.seasonality ?? "N/A"}
                </li>
                <li>
                  <strong>Promotion:</strong>{" "}
                  {forecast.features?.promotion ? "Yes" : "No"}
                </li>
                <li>
                  <strong>Lagged Sales:</strong>{" "}
                  {forecast.features?.laggedSales ?? "N/A"}
                </li>
                <li>
                  <strong>Economic Trend:</strong>{" "}
                  {forecast.features?.economicTrend ?? "N/A"}
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Metrics</h4>
              <ul className="space-y-1 text-sm">
                <li>
                  <strong>RMSE:</strong>{" "}
                  {forecast.metrics?.rmse
                    ? forecast.metrics.rmse.toFixed(2)
                    : "N/A"}
                </li>
                <li>
                  <strong>MAE:</strong>{" "}
                  {forecast.metrics?.mae
                    ? forecast.metrics.mae.toFixed(2)
                    : "N/A"}
                </li>
                <li>
                  <strong>MAPE:</strong>{" "}
                  {forecast.metrics?.mape
                    ? `${forecast.metrics.mape.toFixed(2)}%`
                    : "N/A"}
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {forecast.alert?.isActive && (
        <Card>
          <CardHeader>
            <CardTitle>Alert</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">
              {forecast.alert.message || "No alert message provided"}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ForecastDetails;
