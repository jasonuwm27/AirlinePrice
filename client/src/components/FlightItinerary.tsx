import { Briefcase, Clock, Plane, RotateCcw, Wifi } from "lucide-react";
import type { ReactNode } from "react";
import type { FlightLeg, FlightTimeOption, ScoredFlightOffer } from "@/types";
import { formatCurrency, formatDuration } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

function LegTimeline({
  leg,
  title,
  icon,
}: {
  leg: FlightLeg;
  title: string;
  icon: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </h4>
      <div className="relative space-y-4 border-l-2 border-muted pl-6">
        {leg.segments.map((segment, index) => (
          <div key={`${title}-${index}`} className="relative">
            <div className="absolute -left-[29px] top-1 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {segment.departureTime} - {segment.departureAirport}
              </p>
              <p className="text-xs text-muted-foreground">
                {segment.departureAirportName}
              </p>
              <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatDuration(segment.durationMinutes)}
                <span className="mx-1">-</span>
                {segment.carrier} {segment.flightNumber}
              </div>
              <p className="text-sm font-medium">
                {segment.arrivalTime} - {segment.arrivalAirport}
              </p>
              <p className="text-xs text-muted-foreground">
                {segment.arrivalAirportName}
              </p>
            </div>
            {index < leg.layovers.length && (
              <div className="my-4 flex items-center justify-between border-y border-dashed border-muted py-2 text-xs text-muted-foreground">
                <span>
                  Layover in {leg.layovers[index].airportCode} (
                  {formatDuration(leg.layovers[index].durationMinutes)})
                </span>
                {leg.layovers[index].isOvernight && (
                  <Badge variant="secondary" className="text-[10px]">
                    Overnight
                  </Badge>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function stopsLabel(stops: number): string {
  if (stops === 0) return "Nonstop";
  return `${stops} stop${stops > 1 ? "s" : ""}`;
}

function legTimeRange(leg: FlightLeg): string {
  const first = leg.segments[0];
  const last = leg.segments[leg.segments.length - 1];
  if (!first || !last) return "Time unavailable";
  return `${first.departureTime} - ${last.arrivalTime}`;
}

function AlternativeTimeRow({ option }: { option: FlightTimeOption }) {
  const outboundAirline = option.outbound.segments[0]?.carrier ?? "Airline";
  const inboundRange = option.inbound ? legTimeRange(option.inbound) : null;

  return (
    <div className="grid gap-3 border-b py-3 text-sm last:border-0 md:grid-cols-[1fr_auto] md:items-center">
      <div className="space-y-1">
        <p className="font-medium">{outboundAirline}</p>
        <p className="text-xs text-muted-foreground">
          Outbound {legTimeRange(option.outbound)}
          {inboundRange && <> - Return {inboundRange}</>}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDuration(option.totalDurationMinutes)} - {stopsLabel(option.stops)}
        </p>
      </div>
      <p className="font-semibold md:text-right">
        {formatCurrency(option.price, option.currency)}
      </p>
    </div>
  );
}

export function FlightItinerary({ flight }: { flight: ScoredFlightOffer }) {
  const outboundFallback: FlightLeg = {
    segments: flight.segments,
    layovers: flight.layovers,
    totalDurationMinutes: flight.totalDurationMinutes,
    stops: flight.stops,
    summary: flight.outboundSummary,
    date: flight.departureDate,
  };
  const outbound = flight.outbound ?? outboundFallback;
  const timeOptions = flight.timeOptions ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <LegTimeline
          leg={outbound}
          title="Outbound Journey"
          icon={<Plane className="h-4 w-4" />}
        />

        {flight.inbound && (
          <LegTimeline
            leg={flight.inbound}
            title="Return Journey"
            icon={<RotateCcw className="h-4 w-4" />}
          />
        )}
      </div>

      <div className="grid gap-4 border-t pt-4 md:grid-cols-2">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Amenities & Info</h4>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="flex items-center gap-1">
              <Briefcase className="h-3 w-3" />
              {flight.amenities.baggageIncluded ? "Baggage Included" : "No Checked Bag"}
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              <Wifi className="h-3 w-3" />
              {flight.amenities.wifi ? "Wi-Fi Available" : "No Wi-Fi"}
            </Badge>
            {flight.amenities.seatPitchInches && (
              <Badge variant="outline">
                {flight.amenities.seatPitchInches}" Seat Pitch
              </Badge>
            )}
            <Badge variant="secondary" className="capitalize">
              {flight.amenities.airlineTier} Carrier
            </Badge>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <h4 className="flex items-center justify-between text-sm font-semibold">
            Price Prediction
            <Badge variant={flight.prediction.recommendation === "Buy now" ? "default" : "secondary"}>
              {flight.prediction.recommendation}
            </Badge>
          </h4>
          <p className="text-sm">{flight.prediction.trend}</p>
          <p className="text-xs text-muted-foreground">
            Confidence: {flight.prediction.confidence}
          </p>
        </div>
      </div>

      {timeOptions.length > 0 && (
        <div className="border-t pt-4">
          <h4 className="text-sm font-semibold">Alternative Times for this Date</h4>
          <div className="mt-2 rounded-md border bg-background px-3">
            {timeOptions.map((option) => (
              <AlternativeTimeRow key={option.id} option={option} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
