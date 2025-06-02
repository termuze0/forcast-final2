import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarIcon, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { forecastService } from "../../services/forecastService";
import { Button } from "../../components/ui/Button";
import { Label } from "../../components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/Select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../components/ui/Popover";
import { Calendar } from "../../components/ui/Calendar";
import { cn } from "../../utils/cn";
import type { ForecastRequest } from "../../types/forecast";

const forecastSchema = z
  .object({
    forecastPeriod: z.enum(["Daily", "Weekly", "Monthly"]),
    modelType: z.enum(["ARIMA", "RandomForest"]),
    startDate: z.date(),
    endDate: z.date(),
  })
  .refine((data) => data.startDate < data.endDate, {
    message: "Start date must be before end date",
    path: ["endDate"],
  });

type ForecastFormValues = z.infer<typeof forecastSchema>;

interface ForecastGeneratorProps {
  onSuccess: () => void;
}

const ForecastGenerator = ({ onSuccess }: ForecastGeneratorProps) => {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ForecastFormValues>({
    resolver: zodResolver(forecastSchema),
    defaultValues: {
      forecastPeriod: "Daily",
      modelType: "ARIMA",
      startDate: new Date(),
      endDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
    },
  });

  const startDate = watch("startDate");
  const endDate = watch("endDate");
  const period = watch("forecastPeriod");
  const model = watch("modelType");

  const generateMutation = useMutation({
    mutationFn: forecastService.generateForecast,
    onSuccess: () => {
      toast.success("Forecast generated successfully");
      queryClient.invalidateQueries({ queryKey: ["forecasts"] });
      onSuccess();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to generate forecast");
    },
  });

  const onSubmit = async (data: ForecastFormValues) => {
    setIsSubmitting(true);

    const forecastData: ForecastRequest = {
      forecastPeriod: data.forecastPeriod,
      modelType: data.modelType,
      startDate: format(data.startDate, "yyyy-MM-dd"),
      endDate: format(data.endDate, "yyyy-MM-dd"),
    };

    try {
      await generateMutation.mutateAsync(forecastData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Forecast Period</Label>
          <Select
            value={period}
            onValueChange={(value) =>
              setValue(
                "forecastPeriod",
                value as "Daily" | "Weekly" | "Monthly"
              )
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Daily">Daily</SelectItem>
              <SelectItem value="Weekly">Weekly</SelectItem>
              <SelectItem value="Monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
          {errors.forecastPeriod && (
            <p className="text-sm text-destructive">
              {errors.forecastPeriod.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Forecast Model</Label>
          <Select
            value={model}
            onValueChange={(value) =>
              setValue("modelType", value as "ARIMA" | "RandomForest")
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ARIMA">ARIMA</SelectItem>
              <SelectItem value="RandomForest">Random Forest</SelectItem>
            </SelectContent>
          </Select>
          {errors.modelType && (
            <p className="text-sm text-destructive">
              {errors.modelType.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Start Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !startDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {startDate ? format(startDate, "PPP") : "Select date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(date) => setValue("startDate", date!)}
              />
            </PopoverContent>
          </Popover>
          {errors.startDate && (
            <p className="text-sm text-destructive">
              {errors.startDate.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>End Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !endDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {endDate ? format(endDate, "PPP") : "Select date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={(date) => setValue("endDate", date!)}
              />
            </PopoverContent>
          </Popover>
          {errors.endDate && (
            <p className="text-sm text-destructive">{errors.endDate.message}</p>
          )}
        </div>
      </div>

      <div className="bg-muted/50 p-4 rounded-lg">
        <h4 className="font-medium mb-2 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Forecast Information
        </h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>
            • Daily forecasts are best for short-term predictions (1-14 days)
          </li>
          <li>
            • Weekly forecasts are ideal for medium-term planning (1-8 weeks)
          </li>
          <li>
            • Monthly forecasts work well for long-term strategy (1-12 months)
          </li>
          <li>
            • ARIMA models excel with time series data that shows clear patterns
          </li>
          <li>
            • Random Forest models handle complex, non-linear relationships
            better
          </li>
        </ul>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onSuccess}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Generating..." : "Generate Forecast"}
        </Button>
      </div>
    </form>
  );
};

export default ForecastGenerator;
