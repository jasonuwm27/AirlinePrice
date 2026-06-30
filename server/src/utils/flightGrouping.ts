import type {
  FlightTimeOption,
  ScoredFlightOffer,
} from "../types/index.js";
import { scoreAndRankFlights } from "./scoring.js";

function primaryAirline(flight: ScoredFlightOffer): string {
  return flight.outbound.segments[0]?.carrier ?? "Unknown";
}

function groupKey(flight: ScoredFlightOffer): string {
  return [
    flight.departureDate,
    flight.returnDate ?? "oneway",
    primaryAirline(flight),
    flight.stops,
  ].join("_");
}

function toTimeOption(flight: ScoredFlightOffer): FlightTimeOption {
  return {
    id: flight.id,
    price: flight.price,
    currency: flight.currency,
    totalDurationMinutes: flight.totalDurationMinutes,
    stops: flight.stops,
    outbound: flight.outbound,
    inbound: flight.inbound,
    amenities: flight.amenities,
    departureDate: flight.departureDate,
    returnDate: flight.returnDate,
    outboundSummary: flight.outboundSummary,
    returnSummary: flight.returnSummary,
  };
}

export function groupAndScoreFlights(
  flights: ScoredFlightOffer[],
  maxResults = 25
): ScoredFlightOffer[] {
  const groups = new Map<string, ScoredFlightOffer[]>();

  for (const flight of flights) {
    const key = groupKey(flight);
    const group = groups.get(key) ?? [];
    group.push(flight);
    groups.set(key, group);
  }

  const primaryFlights = Array.from(groups.entries()).map(([key, group]) => {
    const sortedGroup = [...group].sort((a, b) => {
      if (a.price !== b.price) return a.price - b.price;
      return a.totalDurationMinutes - b.totalDurationMinutes;
    });
    const [primary, ...alternatives] = sortedGroup;

    return {
      ...primary,
      groupKey: key,
      timeOptions: alternatives.map(toTimeOption),
    };
  });

  return scoreAndRankFlights(primaryFlights, maxResults);
}
