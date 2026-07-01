import { format } from "date-fns";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  cn,
  compareIsoDates,
  formatIsoDateLocal,
  parseIsoDateLocal,
  todayIsoDate,
} from "@/lib/utils";

interface DateRangeSelectorProps {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}

function DateButton({
  label,
  value,
  placeholder,
  disabledBefore,
  onSelect,
}: {
  label: string;
  value: string;
  placeholder: string;
  disabledBefore: Date;
  onSelect: (date: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => (value ? parseIsoDateLocal(value) ?? undefined : undefined),
    [value]
  );
  const disabledBeforeKey = formatIsoDateLocal(disabledBefore);
  const initialMonth = selected ?? disabledBefore;
  const [month, setMonth] = useState(
    new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1)
  );
  const firstAllowedMonth = new Date(
    disabledBefore.getFullYear(),
    disabledBefore.getMonth(),
    1
  );
  const canGoPrevious = month > firstAllowedMonth;

  useEffect(() => {
    if (!open) return;
    const nextMonth = selected ?? disabledBefore;
    setMonth(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1));
  }, [disabledBeforeKey, open, selected]);

  const changeMonth = (offset: number) => {
    setMonth((current) => {
      const next = new Date(current.getFullYear(), current.getMonth() + offset, 1);
      return next < firstAllowedMonth ? firstAllowedMonth : next;
    });
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "h-12 w-full justify-start text-left font-normal",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {selected ? format(selected, "MMM d, yyyy") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <div className="mb-2 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={!canGoPrevious}
              onClick={() => changeMonth(-1)}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-36 text-center text-sm font-medium">
              {format(month, "MMMM yyyy")}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => changeMonth(1)}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={(date) => {
              if (!date) return;
              onSelect(date);
              setOpen(false);
            }}
            disabled={{ before: disabledBefore }}
            month={month}
            onMonthChange={setMonth}
            hideNavigation
            classNames={{
              root: "p-0",
              month_caption: "flex justify-center pt-1 relative items-center font-medium text-sm mb-2",
              weekday: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
              day: "h-9 w-9 text-center text-sm p-0 relative",
              day_button:
                "h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-accent rounded-md",
              selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground rounded-md",
              today: "font-bold",
              outside: "text-muted-foreground opacity-50",
              disabled: "text-muted-foreground opacity-50",
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function DateRangeSelector({
  startDate,
  endDate,
  onChange,
}: DateRangeSelectorProps) {
  const today = useMemo(() => parseIsoDateLocal(todayIsoDate()) ?? new Date(), []);
  const selectedStart = startDate ? parseIsoDateLocal(startDate) : null;
  const endDisabledBefore = selectedStart && selectedStart > today ? selectedStart : today;

  const selectStart = (date: Date) => {
    const nextStart = formatIsoDateLocal(date);
    const nextEnd =
      endDate && compareIsoDates(endDate, nextStart) >= 0 ? endDate : nextStart;
    onChange(nextStart, nextEnd);
  };

  const selectEnd = (date: Date) => {
    const nextEnd = formatIsoDateLocal(date);
    const nextStart =
      startDate && compareIsoDates(startDate, nextEnd) <= 0 ? startDate : nextEnd;
    onChange(nextStart, nextEnd);
  };

  return (
    <div className="space-y-2">
      <Label>Travel Window</Label>
      <div className="grid gap-3 sm:grid-cols-2">
        <DateButton
          label="Start Date"
          value={startDate}
          placeholder="Select start"
          disabledBefore={today}
          onSelect={selectStart}
        />
        <DateButton
          label="End Date"
          value={endDate}
          placeholder="Select end"
          disabledBefore={endDisabledBefore}
          onSelect={selectEnd}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Select a current or future departure window. Past dates are disabled.
      </p>
    </div>
  );
}
