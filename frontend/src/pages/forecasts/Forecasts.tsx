import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, TrendingUp, BarChart3 } from "lucide-react";
import { forecastService } from "../../services/forecastService";
import { salesService } from "../../services/salesService";
import { Button } from "../../components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/Card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/Dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/Select";
import ForecastGenerator from "./ForecastGenerator";
import ForecastList from "./ForecastList";
import ForecastChart from "../../components/dashboard/ForecastChart";
import { useAuth } from "../../context/AuthContext";
import RoleRoute from "../../components/auth/RoleRoute";

interface ForecastFilters {
  forecastPeriod?: string;
  page: number;
  limit: number;
}

const Forecasts = () => {
  const { user } = useAuth();
  const [showGenerator, setShowGenerator] = useState(false);
  const [filters, setFilters] = useState<ForecastFilters>({
    page: 1,
    limit: 10,
  });

  const {
    data: forecastsData,
    isLoading: forecastsLoading,
    error: forecastsError,
    refetch,
  } = useQuery({
    queryKey: ["forecasts", (user as any)?.id, filters],
    queryFn: () => forecastService.getForecasts(filters),
    enabled: !!(user as any)?.id,
  });

  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ["sales", (user as any)?.id],
    queryFn: () => salesService.getSales({ userId: (user as any)?.id }),
    enabled: !!(user as any)?.id,
  });

  const handleGenerateSuccess = () => {
    setShowGenerator(false);
    refetch();
  };

  const handleFilterChange = (newFilters: Partial<ForecastFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  if (forecastsLoading || salesLoading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <div className="h-8 w-48 bg-muted animate-pulse rounded" />
            <div className="h-4 w-64 bg-muted animate-pulse rounded" />
          </div>
          <RoleRoute requiredRoles={["Manager", "Admin", "Owner"]}>
            <div className="h-8 w-32 bg-muted animate-pulse rounded" />
          </RoleRoute>
        </div>

        {/* Metrics Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="h-4 w-36 bg-muted animate-pulse rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-24 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters Card Skeleton */}
        <Card>
          <CardHeader>
            <div className="h-6 w-48 bg-muted animate-pulse rounded" />
          </CardHeader>
          <CardContent>
            <div className="h-10 w-48 bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>

        {/* Forecast History Table Skeleton */}
        <Card>
          <CardHeader>
            <div className="h-6 w-48 bg-muted animate-pulse rounded" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div
                  key={`skeleton-${i}`}
                  className="h-12 bg-muted animate-pulse rounded"
                />
              ))}
            </div>
            <div className="flex justify-between items-center mt-4">
              <div className="h-8 w-24 bg-muted animate-pulse rounded" />
              <div className="h-4 w-32 bg-muted animate-pulse rounded" />
              <div className="h-8 w-24 bg-muted animate-pulse rounded" />
            </div>
          </CardContent>
        </Card>

        {/* Latest Forecast Chart Skeleton */}
        <Card>
          <CardHeader>
            <div className="h-6 w-48 bg-muted animate-pulse rounded" />
          </CardHeader>
          <CardContent>
            <div className="h-80 w-full bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (forecastsError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-destructive mb-4">
            {(forecastsError as Error).message}
          </p>
          <Button onClick={() => refetch()}>Try Again</Button>
        </div>
      </div>
    );
  }

  // Calculate most used model
  const mostUsedModel =
    (forecastsData?.forecasts ?? []).length > 0
      ? (forecastsData?.forecasts ?? []).reduce((acc, curr) => {
          acc[curr.model] = (acc[curr.model] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      : {};
  const topModel =
    Object.entries(mostUsedModel).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Sales Forecasting</h1>
          <p className="text-muted-foreground">
            Generate and analyze sales predictions
          </p>
        </div>
        <RoleRoute requiredRoles={["Manager", "Admin", "Owner"]}>
          <Button onClick={() => setShowGenerator(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Generate Forecast
          </Button>
        </RoleRoute>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Total Forecasts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {forecastsData?.total || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Latest Confidence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(forecastsData?.forecasts ?? []).length > 0
                ? `${forecastsData?.forecasts[0]?.predictions[0]?.confidence.toFixed(
                    1
                  )}%`
                : "N/A"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Most Used Model
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{topModel}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>

        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-48">
                <Select
                  value={filters.forecastPeriod || "all"}
                  onValueChange={(value) =>
                    handleFilterChange({
                      forecastPeriod: value === "all" ? undefined : value,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Periods</SelectItem>
                    <SelectItem value="Daily">Daily</SelectItem>
                    <SelectItem value="Weekly">Weekly</SelectItem>
                    <SelectItem value="Monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Forecast History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ForecastList
            forecasts={forecastsData?.forecasts || []}
            isLoading={forecastsLoading}
          />
          {(forecastsData?.totalPages ?? 0) > 1 && (
            <div className="flex justify-between items-center mt-4">
              <Button
                disabled={filters.page === 1}
                onClick={() => handlePageChange(filters.page - 1)}
              >
                Previous
              </Button>
              <span>
                Page {filters.page} of {forecastsData?.totalPages}
              </span>
              <Button
                disabled={filters.page === forecastsData?.totalPages}
                onClick={() => handlePageChange(filters.page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {(forecastsData?.forecasts ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Latest Forecast vs Actual Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ForecastChart
                forecast={forecastsData?.forecasts?.[0] ?? null}
                sales={salesData?.sales || []}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showGenerator} onOpenChange={setShowGenerator}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generate New Forecast</DialogTitle>
          </DialogHeader>
          <ForecastGenerator onSuccess={handleGenerateSuccess} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Forecasts;
