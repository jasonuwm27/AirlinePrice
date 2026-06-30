import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Car,
  Clock,
  Gauge,
  Plane,
  Sparkles,
  Timer,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FlightItinerary } from "@/components/FlightItinerary";
import { useSearch } from "@/context/SearchContext";
import {
  calculateTripDurationDays,
  cn,
  formatCurrency,
  formatDuration,
  formatDrivingTime,
  formatMiles,
  formatShortDate,
} from "@/lib/utils";
import type {
  DistanceDisplayMode,
  FlightLeg,
  RouteOption,
  ScoredFlightOffer,
  SortOption,
} from "@/types";
import { ResultsSkeleton } from "./ResultsSkeleton";

const SORT_LABELS: Record<SortOption, string> = {
  cheapest: "Cheapest",
  fastest: "Fastest",
  best_value: "Best Value",
};

function ScoreBadge({ score }: { score: number }) {
  let colorClass = "bg-success/10 text-success border-success/20";
  if (score < 60) colorClass = "bg-orange-500/10 text-orange-600 border-orange-500/20";
  if (score < 40) colorClass = "bg-destructive/10 text-destructive border-destructive/20";

  return (
    <div className={cn("inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-semibold", colorClass)}>
      Score: {score}
    </div>
  );
}

function getOutboundLeg(flight: ScoredFlightOffer): FlightLeg {
  return (
    flight.outbound ?? {
      segments: flight.segments,
      layovers: flight.layovers,
      totalDurationMinutes: flight.totalDurationMinutes,
      stops: flight.stops,
      summary: flight.outboundSummary,
      date: flight.departureDate,
    }
  );
}

function getAirlineLogos(flight: ScoredFlightOffer): { carrier: string; logo: string }[] {
  const segments = [
    ...(flight.outbound?.segments ?? flight.segments),
    ...(flight.inbound?.segments ?? []),
  ];
  const logos = new Map<string, { carrier: string; logo: string }>();

  segments.forEach((segment) => {
    if (segment.carrierLogo && !logos.has(segment.carrier)) {
      logos.set(segment.carrier, {
        carrier: segment.carrier,
        logo: segment.carrierLogo,
      });
    }
  });

  return Array.from(logos.values()).slice(0, 3);
}

function FlightRow({
  flight,
  isBestDeal,
}: {
  flight: ScoredFlightOffer;
  isBestDeal: boolean;
}) {
  const outbound = getOutboundLeg(flight);
  const tripDurationDays = calculateTripDurationDays(
    flight.departureDate,
    flight.returnDate
  );
  const dateSummary = flight.returnDate
    ? `${formatShortDate(flight.departureDate)} - ${formatShortDate(flight.returnDate)}`
    : formatShortDate(flight.departureDate);
  const airlineLogos = getAirlineLogos(flight);

  return (
    <AccordionItem value={flight.id} className="border-b last:border-0">
      <AccordionTrigger className="px-4 py-4 transition-colors hover:bg-muted/30 hover:no-underline">
        <div className="mr-4 flex flex-1 flex-wrap items-center justify-between gap-4">
          <div className="flex w-full items-center gap-4 sm:w-auto">
            {airlineLogos.length > 0 && (
              <div className="flex shrink-0 -space-x-2">
                {airlineLogos.map((item) => (
                  <img
                    key={item.carrier}
                    src={item.logo}
                    alt={item.carrier}
                    className="h-8 w-8 rounded-full border bg-background object-contain p-1"
                  />
                ))}
              </div>
            )}
            <div className="flex flex-col items-start gap-1">
              <ScoreBadge score={flight.totalScore} />
              <div className="flex items-center gap-1 text-sm font-medium">
                <span>{flight.dealEmoji}</span>
                <span>{flight.dealLabel}</span>
              </div>
            </div>
            <div className="mx-2 hidden h-10 w-px bg-border sm:block" />
            <div className="space-y-1 text-left">
              <p className="flex items-center gap-2 font-medium">
                {outbound.segments[0]?.carrier}
                {outbound.segments.length > 1 && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    +{outbound.segments.length - 1}
                  </span>
                )}
              </p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatDuration(flight.totalDurationMinutes)}
                <span>-</span>
                {flight.stops === 0
                  ? "Nonstop"
                  : `${flight.stops} stop${flight.stops > 1 ? "s" : ""}`}
              </p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarDays className="h-3 w-3" />
                {dateSummary}
                {tripDurationDays && (
                  <>
                    <span>-</span>
                    {tripDurationDays} day trip
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex w-full flex-row items-center justify-between text-right sm:w-auto sm:flex-col sm:items-end sm:justify-center">
            <div className="flex items-center gap-2">
              {isBestDeal && (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                  <Sparkles className="h-3 w-3" />
                  Top Pick
                </span>
              )}
              <p className="text-xl font-bold">{formatCurrency(flight.price)}</p>
            </div>
            <p className="text-xs text-muted-foreground">{flight.priceVsAverage}</p>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        <FlightItinerary flight={flight} />
      </AccordionContent>
    </AccordionItem>
  );
}

function RouteCard({
  route,
  isBest,
  displayMode,
}: {
  route: RouteOption;
  isBest: boolean;
  displayMode: DistanceDisplayMode;
}) {
  const isDirect = route.type === "direct";
  const hasFlights = route.topFlights.length > 0;
  const [visibleFlights, setVisibleFlights] = useState(5);
  const visibleFlightResults = route.topFlights.slice(0, visibleFlights);
  const hasMoreFlights = visibleFlights < route.topFlights.length;

  useEffect(() => {
    setVisibleFlights(5);
  }, [route.id, route.topFlights.length]);

  return (
    <Card
      className={cn(
        "overflow-hidden transition-shadow animate-fade-in hover:shadow-md",
        isBest && "ring-2 ring-success/50",
        isDirect && "border-primary/30 bg-primary/[0.02]"
      )}
    >
      <CardHeader className="border-b bg-muted/20 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {isDirect ? (
                <Plane className="h-4 w-4 text-primary" />
              ) : (
                <Car className="h-4 w-4 text-orange-500" />
              )}
              <CardTitle className="text-base">{route.label}</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              {route.origin}
              <ArrowRight className="mx-1 inline h-3 w-3" />
              {route.flightDestination}
              {!isDirect && (
                <>
                  <Car className="mx-1 inline h-3 w-3" />
                  {route.finalDestination}
                </>
              )}
            </p>
          </div>

          {!isDirect && route.airport && (
            <div className="text-right">
              <p className="text-sm font-medium">
                {displayMode === "time" ? "Drive Time" : "Drive Distance"}
              </p>
              <p className="text-sm text-muted-foreground">
                {displayMode === "time"
                  ? formatDrivingTime(route.drivingDurationMinutes)
                  : formatMiles(route.drivingMiles)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Est. {formatCurrency(route.drivingCost)}
              </p>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {route.error && (
          <div className="m-4 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {route.error}
          </div>
        )}

        {!hasFlights && !route.error && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No flights found for this route.
          </div>
        )}

        {hasFlights && (
          <>
            <Accordion>
              {visibleFlightResults.map((flight, idx) => (
                <FlightRow
                  key={flight.id}
                  flight={flight}
                  isBestDeal={isBest && idx === 0}
                />
              ))}
            </Accordion>
            {hasMoreFlights && (
              <div className="border-t bg-muted/10 p-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    setVisibleFlights((current) =>
                      Math.min(current + 5, route.topFlights.length)
                    )
                  }
                >
                  <Plane className="mr-2 h-4 w-4" />
                  Load More Flights
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function ResultsMatrix() {
  const { results, sortedRoutes, isLoading, error, sortBy, setSortBy } = useSearch();
  const [displayMode, setDisplayMode] = useState<DistanceDisplayMode>("distance");

  if (isLoading) return <ResultsSkeleton />;

  if (error) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="flex items-center gap-3 py-8">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!results) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Plane className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <h3 className="text-lg font-medium">Ready to find savings?</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Enter your route details above and we'll compare direct flights against
            alternative airports within your driving radius.
          </p>
        </CardContent>
      </Card>
    );
  }

  let highestScore = -1;
  let bestRouteId = "";

  sortedRoutes.forEach((route) => {
    if (route.topFlights.length > 0 && route.topFlights[0].totalScore > highestScore) {
      highestScore = route.topFlights[0].totalScore;
      bestRouteId = route.id;
    }
  });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Route Comparison</h2>
          <p className="text-sm text-muted-foreground">
            Found {results.nearbyAirports.length} alternative airport
            {results.nearbyAirports.length !== 1 ? "s" : ""} within{" "}
            {results.criteria.radiusMiles} miles
          </p>
        </div>

        <div className="flex items-center gap-3">
          <ToggleGroup
            value={displayMode}
            onValueChange={(value) =>
              value && setDisplayMode(value as DistanceDisplayMode)
            }
          >
            <ToggleGroupItem value="distance">
              <Gauge className="h-3.5 w-3.5" />
              Miles
            </ToggleGroupItem>
            <ToggleGroupItem value="time">
              <Timer className="h-3.5 w-3.5" />
              Hours
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Sort by:</span>
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABELS) as SortOption[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {SORT_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {sortedRoutes.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No flight results found for this search. Try expanding your date range or radius.
          </CardContent>
        </Card>
      ) : (
        sortedRoutes.map((route) => (
          <RouteCard
            key={route.id}
            route={route}
            isBest={route.id === bestRouteId}
            displayMode={displayMode}
          />
        ))
      )}

      {results.nearbyAirports.length > 0 && (
        <Card className="bg-muted/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Airports within {results.criteria.radiusMiles} mi of {results.criteria.destination}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {results.nearbyAirports.map((airport) => (
                <span
                  key={airport.iataCode}
                  className="rounded-md border bg-background px-2.5 py-1 text-xs"
                >
                  {airport.iataCode} - {formatMiles(airport.distanceMiles)}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
