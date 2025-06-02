import { useState, useEffect } from "react";
import { CalendarIcon, Search } from "lucide-react";
import { format, isBefore } from "date-fns";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { Switch } from "../../components/ui/Switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../components/ui/Popover";
import { Calendar } from "../../components/ui/Calendar";
import { cn } from "../../utils/cn";
import toast from "react-hot-toast";

interface SalesFiltersProps {
  onFiltersChange: (filters: {
    startDate?: string;
    endDate?: string;
    promotion?: boolean;
    minAmount?: number;
    maxAmount?: number;
  }) => void;
}

const SalesFilters = ({ onFiltersChange }: SalesFiltersProps) => {
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [promotionOnly, setPromotionOnly] = useState(false);
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");

  // Debounce filter updates to avoid excessive re-renders
  useEffect(() => {
    const handler = setTimeout(() => {
      const filters: {
        startDate?: string;
        endDate?: string;
        promotion?: boolean;
        minAmount?: number;
        maxAmount?: number;
      } = {};

      // Validate and apply filters
      if (startDate) filters.startDate = format(startDate, "yyyy-MM-dd");
      if (endDate) filters.endDate = format(endDate, "yyyy-MM-dd");
      if (promotionOnly) filters.promotion = true;
      if (minAmount && Number.parseFloat(minAmount) >= 0) {
        filters.minAmount = Number.parseFloat(minAmount);
      }
      if (maxAmount && Number.parseFloat(maxAmount) >= 0) {
        filters.maxAmount = Number.parseFloat(maxAmount);
      }

      // Validate date range
      if (startDate && endDate && isBefore(endDate, startDate)) {
        toast.error("End date cannot be before start date");
        return;
      }

      // Validate amount range
      if (
        filters.minAmount !== undefined &&
        filters.maxAmount !== undefined &&
        filters.minAmount > filters.maxAmount
      ) {
        toast.error("Minimum amount cannot be greater than maximum amount");
        return;
      }

      onFiltersChange(filters);
    }, 300); // Debounce for 300ms

    return () => clearTimeout(handler);
  }, [
    startDate,
    endDate,
    promotionOnly,
    minAmount,
    maxAmount,
    onFiltersChange,
  ]);

  const handleClearFilters = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setPromotionOnly(false);
    setMinAmount("");
    setMaxAmount("");
    onFiltersChange({});
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
              {startDate ? format(startDate, "PPP") : "Pick a date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={startDate}
              onSelect={setStartDate}
              autoFocus
            />
          </PopoverContent>
        </Popover>
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
              {endDate ? format(endDate, "PPP") : "Pick a date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={endDate}
              onSelect={setEndDate}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2">
        <Label>Amount Range</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="Min"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            min="0"
          />
          <Input
            type="number"
            placeholder="Max"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
            min="0"
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Switch
            id="promotion"
            checked={promotionOnly}
            onCheckedChange={setPromotionOnly}
          />
          <Label htmlFor="promotion">Promotion Only</Label>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => toast.success("Filters applied")}
            className="flex-1"
          >
            <Search className="mr-2 h-4 w-4" />
            Apply
          </Button>
          <Button variant="outline" onClick={handleClearFilters}>
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SalesFilters;
