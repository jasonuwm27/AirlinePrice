/**
 * Transforms raw SerpAPI Google Flights results into scored offer objects.
 *
 * Round-trip offers are represented as one object with separate outbound and
 * inbound legs. The older segments/layovers fields remain as compatibility
 * aliases for code that still expects the previous shape.
 */

import type {
  FlightAmenities,
  FlightLeg,
  FlightSegment,
  LayoverInfo,
  ScoredFlightOffer,
  SerpApiFlightResult,
} from "../types/index.js";
import { detectAirlineTier } from "../utils/scoring.js";

function parseAmenities(...results: SerpApiFlightResult[]): FlightAmenities {
  const allExtensions = results.flatMap((result) => [
    ...(result.extensions ?? []),
    ...result.flights.flatMap((flight) => flight.extensions ?? []),
  ]);

  const extLower = allExtensions.map((extension) => extension.toLowerCase());

  const baggageIncluded = extLower.some(
    (extension) =>
      extension.includes("checked bag") ||
      extension.includes("baggage included") ||
      extension.includes("1 carry-on bag")
  );

  const wifi = extLower.some(
    (extension) => extension.includes("wi-fi") || extension.includes("wifi")
  );

  let seatPitchInches: number | null = null;
  for (const extension of allExtensions) {
    const match =
      extension.match(/(\d{2,3})["″]\s*seat\s*pitch/i) ??
      extension.match(/seat\s*pitch[:\s]*(\d{2,3})/i);
    if (match) {
      seatPitchInches = parseInt(match[1], 10);
      break;
    }
  }

  const primaryCarrier = results[0]?.flights[0]?.airline ?? "";
  const airlineTier = detectAirlineTier(primaryCarrier);

  return { baggageIncluded, wifi, seatPitchInches, airlineTier };
}

function mapSegments(result: SerpApiFlightResult): FlightSegment[] {
  return result.flights.map((flight) => ({
    departureAirport: flight.departure_airport.id,
    departureAirportName: flight.departure_airport.name,
    arrivalAirport: flight.arrival_airport.id,
    arrivalAirportName: flight.arrival_airport.name,
    departureTime: flight.departure_airport.time,
    arrivalTime: flight.arrival_airport.time,
    carrier: flight.airline,
    carrierLogo: flight.airline_logo,
    flightNumber: flight.flight_number,
    durationMinutes: flight.duration,
  }));
}

function mapLayovers(result: SerpApiFlightResult): LayoverInfo[] {
  return (result.layovers ?? []).map((layover) => ({
    airportCode: layover.id,
    airportName: layover.name,
    durationMinutes: layover.duration,
    isOvernight: layover.overnight ?? layover.duration >= 480,
  }));
}

function buildLegSummary(segments: FlightSegment[]): string {
  if (segments.length === 0) return "";
  const first = segments[0];
  const last = segments[segments.length - 1];
  return `${first.departureAirport} ${first.departureTime} -> ${last.arrivalAirport} ${last.arrivalTime}`;
}

export function mapSerpApiFlightLeg(
  result: SerpApiFlightResult,
  date: string
): FlightLeg {
  const segments = mapSegments(result);
  const layovers = mapLayovers(result);

  return {
    segments,
    layovers,
    totalDurationMinutes: result.total_duration,
    stops: layovers.length || Math.max(0, result.flights.length - 1),
    summary: buildLegSummary(segments),
    date,
  };
}

export function mapSerpApiFlight(
  result: SerpApiFlightResult,
  index: number,
  departureDate: string,
  returnDate?: string,
  currency = "USD",
  inboundResult?: SerpApiFlightResult
): ScoredFlightOffer {
  const outbound = mapSerpApiFlightLeg(result, departureDate);
  const inbound =
    inboundResult && returnDate
      ? mapSerpApiFlightLeg(inboundResult, returnDate)
      : undefined;
  const allLayovers = [...outbound.layovers, ...(inbound?.layovers ?? [])];
  const amenities = inboundResult
    ? parseAmenities(result, inboundResult)
    : parseAmenities(result);
  const stops = outbound.stops + (inbound?.stops ?? 0);

  const depAirport = result.flights[0]?.departure_airport.id ?? "???";
  const arrAirport = result.flights.at(-1)?.arrival_airport.id ?? "???";
  const inboundCarrier = inboundResult?.flights[0]?.airline ?? "oneway";

  return {
    id: `serp-${departureDate}-${returnDate ?? "oneway"}-${depAirport}-${arrAirport}-${inboundCarrier}-${index}`,
    price: inboundResult?.price ?? result.price,
    currency,
    totalDurationMinutes:
      outbound.totalDurationMinutes + (inbound?.totalDurationMinutes ?? 0),
    stops,
    outbound,
    inbound,
    segments: outbound.segments,
    layovers: allLayovers,
    amenities,
    departureDate,
    returnDate,
    outboundSummary: outbound.summary,
    returnSummary:
      inbound?.summary ?? (returnDate ? `Return: ${returnDate}` : undefined),
    timeOptions: [],
    arrivalAirportIata: arrAirport,
    departureToken: result.departure_token,

    totalScore: 0,
    priceScore: 0,
    qualityScore: 0,
    dealLabel: "Fair Price",
    dealEmoji: ":|",
    priceVsAverage: "",
    confidence: "Low",
    prediction: {
      trend: "-> Stable",
      recommendation: "No data",
      confidence: "Low",
      mlFeatures: {},
    },
  };
}

export function mapSerpApiResults(
  results: SerpApiFlightResult[],
  departureDate: string,
  returnDate?: string,
  currency = "USD"
): ScoredFlightOffer[] {
  return results.map((result, index) =>
    mapSerpApiFlight(result, index, departureDate, returnDate, currency)
  );
}

export function attachInboundSerpApiFlight(
  flight: ScoredFlightOffer,
  inboundResult: SerpApiFlightResult,
  currency = flight.currency
): ScoredFlightOffer {
  if (!flight.returnDate) return flight;

  const inbound = mapSerpApiFlightLeg(inboundResult, flight.returnDate);
  const layovers = [...flight.outbound.layovers, ...inbound.layovers];

  return {
    ...flight,
    price: inboundResult.price ?? flight.price,
    currency,
    totalDurationMinutes:
      flight.outbound.totalDurationMinutes + inbound.totalDurationMinutes,
    stops: flight.outbound.stops + inbound.stops,
    inbound,
    layovers,
    returnSummary: inbound.summary,
  };
}
