import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DateRangeSelectorProps {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}

export function DateRangeSelector({ startDate, endDate, onChange }: DateRangeSelectorProps) {
  const [open, setOpen] = useState(false);

  const range: DateRange | undefined =
    startDate && endDate
      ? { from: new Date(startDate), to: new Date(endDate) }
      : startDate
        ? { from: new Date(startDate), to: undefined }
        : undefined;

  const handleSelect = (selected: DateRange | undefined) => {
    if (selected?.from) {
      const start = format(selected.from, "yyyy-MM-dd");
      const end = selected.to ? format(selected.to, "yyyy-MM-dd") : "";
      onChange(start, end);
      if (selected.to) setOpen(false);
    }
  };

  const label =
    startDate && endDate
      ? `${format(new Date(startDate), "MMM d, yyyy")} – ${format(new Date(endDate), "MMM d, yyyy")}`
      : startDate
        ? `${format(new Date(startDate), "MMM d, yyyy")} – Select end`
        : "Select flexible date range";

  return (
    <div className="space-y-2">
      <Label>Travel Window</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !startDate && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <DayPicker
            mode="range"
            selected={range}
            onSelect={handleSelect}
            numberOfMonths={2}
            disabled={{ before: new Date() }}
            classNames={{
              root: "p-3",
              months: "flex flex-col sm:flex-row gap-4",
              month_caption: "flex justify-center pt-1 relative items-center font-medium text-sm mb-2",
              weekday: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
              day: "h-9 w-9 text-center text-sm p-0 relative",
              day_button:
                "h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-accent rounded-md",
              selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground rounded-md",
              range_start: "bg-primary text-primary-foreground rounded-l-md",
              range_end: "bg-primary text-primary-foreground rounded-r-md",
              range_middle: "bg-primary/20 rounded-none",
              today: "font-bold",
              outside: "text-muted-foreground opacity-50",
              disabled: "text-muted-foreground opacity-50",
            }}
          />
        </PopoverContent>
      </Popover>
      <p className="text-xs text-muted-foreground">
        Select any departure window — we'll search across all dates in this range.
      </p>
    </div>
  );
}
