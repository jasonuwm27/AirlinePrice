import { Info, Loader2, MapPin, Plane, Search, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { DateRangeSelector } from "@/components/DateRangeSelector";
import { RadiusSlider } from "@/components/RadiusSlider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useSearch } from "@/context/SearchContext";
import { estimateSearchCredits, suggestLocations } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { LocationSuggestion, SearchEstimate } from "@/types";

function isIataCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value.trim().toUpperCase());
}

function getEstimateBlocker(criteria: ReturnType<typeof useSearch>["criteria"]): string | null {
  if (!criteria.destination) return null;
  if (!isIataCode(criteria.destination)) {
    return "Choose a valid destination airport from the suggestions to estimate credits.";
  }
  if (!criteria.dateRangeStart || !criteria.dateRangeEnd) return null;
  if (criteria.dateRangeStart > criteria.dateRangeEnd) {
    return "Choose a start date before the end date to estimate credits.";
  }
  if (
    !Number.isFinite(criteria.tripDurationMin) ||
    !Number.isFinite(criteria.tripDurationMax) ||
    criteria.tripDurationMin < 1 ||
    criteria.tripDurationMax < 1
  ) {
    return "Trip duration must be at least 1 day.";
  }
  return null;
}

function AirportInput({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (code: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const fetchSuggestions = useCallback(async (keyword: string) => {
    if (keyword.length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      const results = await suggestLocations(keyword);
      setSuggestions(results);
    } catch {
      setSuggestions([]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchSuggestions(inputValue), 300);
    return () => clearTimeout(timer);
  }, [inputValue, fetchSuggestions]);

  const selectSuggestion = (s: LocationSuggestion) => {
    setInputValue(s.iataCode);
    onChange(s.iataCode);
    setShowSuggestions(false);
  };

  return (
    <div className="relative space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          value={inputValue}
          placeholder={placeholder}
          className="pl-9 uppercase"
          onChange={(e) => {
            const nextValue = e.target.value.toUpperCase();
            setInputValue(nextValue);
            onChange(nextValue);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        />
      </div>
      {showSuggestions && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover shadow-lg">
          {suggestions.map((s) => (
            <li key={s.iataCode}>
              <button
                type="button"
                className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-accent"
                onMouseDown={() => selectSuggestion(s)}
              >
                <span className="font-medium">
                  {s.iataCode} — {s.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {s.cityName}, {s.countryName}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SearchPanel() {
  const { criteria, setCriteria, executeSearch, isLoading } = useSearch();
  const [estimate, setEstimate] = useState<SearchEstimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const isOneWay = !criteria.returnTrip;

  useEffect(() => {
    const blocker = getEstimateBlocker(criteria);
    if (
      blocker ||
      !criteria.destination ||
      !criteria.dateRangeStart ||
      !criteria.dateRangeEnd
    ) {
      if (blocker) setEstimate(null);
      setEstimateError(blocker);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const nextEstimate = await estimateSearchCredits(criteria);
        if (!cancelled) {
          setEstimate(nextEstimate);
          setEstimateError(
            nextEstimate.possibleDatePairCount === 0
              ? criteria.returnTrip
                ? "No valid round trips fit inside this date window and duration range."
                : "No valid departure dates fit inside this travel window."
              : null
          );
        }
      } catch (err) {
        if (!cancelled) {
          setEstimate(null);
          setEstimateError(
            err instanceof Error ? err.message : "Could not estimate credits."
          );
        }
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [criteria]);

  const handleSearch = async () => {
    if (
      estimate &&
      (estimate.maxCredits > 100 || criteria.searchDepth === "full")
    ) {
      const proceed = window.confirm(
        `This search may use up to ${estimate.maxCredits} SerpAPI credits and will search ${estimate.datePairCount} of ${estimate.possibleDatePairCount} possible date pairs. Continue?`
      );
      if (!proceed) return;
    }

    await executeSearch();
  };
  const allDatePairsSelected =
    estimate && estimate.datePairCount >= estimate.possibleDatePairCount;
  const estimateUnitLabel = criteria.returnTrip ? "date pairs" : "departure dates";
  const detailCreditLabel =
    estimate && estimate.detailCredits > 0
      ? ` + ${estimate.detailCredits} itinerary detail calls`
      : "";
  const coverageNote =
    criteria.searchDepth === "smart"
      ? " Smart uses anchor dates first, then drills into the cheapest local window."
      : criteria.searchDepth === "expanded"
        ? " Expanded uses a sparse grid across the full range."
        : "";

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Plane className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Find Your Best Flight Deal</CardTitle>
            <CardDescription>
              Compare direct flights vs. flying to nearby airports + driving
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <AirportInput
            id="origin"
            label="From"
            value={criteria.origin}
            placeholder="e.g. JFK, LAX"
            onChange={(code) => setCriteria({ origin: code })}
          />
          <AirportInput
            id="destination"
            label="To (Final Destination)"
            value={criteria.destination}
            placeholder="e.g. MIA, ORD"


            onChange={(code) => setCriteria({ destination: code })}
          />
        </div>

        <DateRangeSelector
          startDate={criteria.dateRangeStart}
          endDate={criteria.dateRangeEnd}
          mode={isOneWay ? "single" : "range"}
          onChange={(start, end) =>
            setCriteria({
              dateRangeStart: start,
              dateRangeEnd: isOneWay ? start : end,
            })
          }
        />

        <div
          className={cn(
            "grid gap-4 items-end",
            isOneWay ? "sm:grid-cols-2" : "sm:grid-cols-3"
          )}
        >
          {!isOneWay && (
            <div className="space-y-2">
              <Label>Trip Duration (days)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={criteria.tripDurationMin}
                  onChange={(e) =>
                    setCriteria({
                      tripDurationMin:
                        e.target.value === "" ? 1 : Number(e.target.value),
                    })
                  }
                />
                <span className="text-muted-foreground">to</span>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={criteria.tripDurationMax}
                  onChange={(e) =>
                    setCriteria({
                      tripDurationMax:
                        e.target.value === "" ? 1 : Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="flex items-center gap-2 justify-center w-full">
              <Users className="h-4 w-4" />
              Passengers
            </Label>
            <Select
              value={String(criteria.passengers)}
              onValueChange={(v) => setCriteria({ passengers: Number(v) })}
            >
              <SelectTrigger className="w-full justify-center">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} {n === 1 ? "passenger" : "passengers"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Trip Type</Label>
            <Select
              value={criteria.returnTrip ? "roundtrip" : "oneway"}
              onValueChange={(v) =>
                setCriteria({
                  returnTrip: v === "roundtrip",
                  ...(v === "oneway" && criteria.dateRangeStart
                    ? { dateRangeEnd: criteria.dateRangeStart }
                    : {}),
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="roundtrip">Round Trip</SelectItem>
                <SelectItem value="oneway">One Way</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <RadiusSlider
          value={criteria.radiusMiles}
          onChange={(miles) => setCriteria({ radiusMiles: miles })}
        />

        {!isOneWay && (
          <div className="space-y-2">
            <Label>Search Coverage</Label>
            <ToggleGroup
              value={criteria.searchDepth ?? "smart"}
              onValueChange={(value) => {
                if (!value) return;
                setCriteria({
                  searchDepth: value as "smart" | "expanded" | "full",
                });
              }}
              className="grid grid-cols-3 gap-2"
            >
              <ToggleGroupItem value="smart" className="w-full">
                Smart
              </ToggleGroupItem>
              <ToggleGroupItem value="expanded" className="w-full">
                Expanded
              </ToggleGroupItem>
              <ToggleGroupItem value="full" className="w-full">
                Full
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}

        {(estimate || estimateError) && (
          <div className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            {estimate ? (
              <p>
                Estimated SerpAPI use: up to{" "}
                <span className="font-medium text-foreground">
                  {estimate.maxCredits} credits
                </span>{" "}
                ({estimate.scanCredits} {criteria.returnTrip ? "matrix" : "one-way"} scans{detailCreditLabel}).
                Searching{" "}
                <span className="font-medium text-foreground">
                  {estimate.datePairCount} of {estimate.possibleDatePairCount}
                </span>{" "}
                possible {estimateUnitLabel} across{" "}
                {estimate.routeTargetCount} airport target
                {estimate.routeTargetCount === 1 ? "" : "s"} with one multi-airport query per search unit.
                {!allDatePairsSelected && coverageNote}
                {!allDatePairsSelected && " Use Expanded or Full to cover more dates."}
                {estimateError && ` ${estimateError}`}
              </p>
            ) : (
              <p>{estimateError}</p>
            )}
          </div>
        )}

        <Button
          className="w-full"
          size="lg"
          onClick={handleSearch}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching flights…
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              Search & Compare Routes
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
