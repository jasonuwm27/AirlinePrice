import {
  findNearbyAirports,
  resolveAirportCoords,
} from "./airports.js";
import {
  buildDateMatrixPlan,
  estimateSerpApiCredits,
  searchFlightMatrixOffers,
} from "./serpapi.js";
import {
  estimateDrivingCost,
  getDrivingDistanceMiles,
} from "./osrm.js";
import type {
  AirportInfo,
  Coordinates,
  ScoredFlightOffer,
  RouteOption,
  SearchCriteria,
  SearchResponse,
} from "../types/index.js";
import {
  runWithConcurrency,
} from "../utils/geo.js";

const MAX_ALTERNATIVES = 5;
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_SEARCHES ?? "3", 10);
const BATCH_DELAY = parseInt(process.env.API_BATCH_DELAY_MS ?? "500", 10);

async function findNearbyAirportsForDestination(
  destination: string,
  coords: Coordinates,
  radiusMiles: number
): Promise<AirportInfo[]> {
  const airports = findNearbyAirports(coords, radiusMiles, destination);
  return airports.slice(0, MAX_ALTERNATIVES);
}

function buildRouteOption(
  partial: Omit<RouteOption, "totalCost" | "savingsVsDirect">
): RouteOption {
  const totalCost = partial.flightCost + partial.drivingCost;

  return {
    ...partial,
    totalCost,
    savingsVsDirect: null,
  };
}

function flightArrivalAirport(flight: ScoredFlightOffer): string {
  return (
    flight.arrivalAirportIata ??
    flight.outbound.segments.at(-1)?.arrivalAirport ??
    ""
  ).toUpperCase();
}

function flightsForArrival(
  flights: ScoredFlightOffer[],
  arrivalAirport: string
): ScoredFlightOffer[] {
  const arrival = arrivalAirport.toUpperCase();
  return flights.filter((flight) => flightArrivalAirport(flight) === arrival);
}

function cheapestPrice(flights: ScoredFlightOffer[]): number {
  return flights.length > 0
    ? Math.min(...flights.map((flight) => flight.price))
    : 0;
}

function applySavings(routes: RouteOption[]): RouteOption[] {
  const direct = routes.find((r) => r.type === "direct");
  const directCost = direct?.totalCost ?? 0;

  return routes.map((route) => {
    if (route.type === "direct" || !direct) {
      return { ...route, savingsVsDirect: null };
    }
    const savings = directCost - route.totalCost;
    return {
      ...route,
      savingsVsDirect: savings > 0 ? Math.round(savings) : null,
    };
  });
}

export async function executeSearch(criteria: SearchCriteria): Promise<SearchResponse> {
  const origin = criteria.origin.toUpperCase();
  const destination = criteria.destination.toUpperCase();

  if (!criteria.returnTrip) {
    throw new Error("Flexible optimized search currently requires a round trip.");
  }

  const destCoords = resolveAirportCoords(destination);
  const nearbyAirports = await findNearbyAirportsForDestination(
    destination,
    destCoords,
    criteria.radiusMiles
  );

  const alternativeTargets = nearbyAirports.filter(
    (ap) => ap.iataCode !== destination
  );
  const targetAirportCodes = [
    destination,
    ...alternativeTargets.map((airport) => airport.iataCode),
  ];

  const allFlights = await searchFlightMatrixOffers({
    origin,
    destinations: targetAirportCodes,
    startDate: criteria.dateRangeStart,
    endDate: criteria.dateRangeEnd,
    minDuration: criteria.tripDurationMin,
    maxDuration: criteria.tripDurationMax,
    adults: criteria.passengers,
    searchDepth: criteria.searchDepth ?? "smart",
  });

  const directFlights = flightsForArrival(allFlights, destination);
  const bestDirectPrice = cheapestPrice(directFlights);

  const directRoute = buildRouteOption({
    id: "direct",
    type: "direct",
    label: `Direct to ${destination}`,
    origin,
    flightDestination: destination,
    finalDestination: destination,
    topFlights: directFlights,
    drivingMiles: 0,
    drivingDurationMinutes: 0,
    drivingCost: 0,
    flightCost: bestDirectPrice,
    totalDurationMinutes: directFlights[0]?.totalDurationMinutes ?? 0,
  });

  const altResults = await runWithConcurrency(
    alternativeTargets,
    MAX_CONCURRENT,
    BATCH_DELAY,
    async (airport): Promise<RouteOption> => {
      try {
        const topFlights = flightsForArrival(allFlights, airport.iataCode);
        const airportCoords = resolveAirportCoords(airport.iataCode);

        const driving = await getDrivingDistanceMiles(airportCoords, destCoords);
        const bestPrice = cheapestPrice(topFlights);

        return buildRouteOption({
          id: `alt-${airport.iataCode}`,
          type: "alternative",
          label: `Fly to ${airport.iataCode} + Drive`,
          origin,
          flightDestination: airport.iataCode,
          finalDestination: destination,
          topFlights,
          drivingMiles: Math.round(driving.miles * 10) / 10,
          drivingDurationMinutes: driving.durationMinutes,
          drivingCost: estimateDrivingCost(driving.miles),
          flightCost: bestPrice,
          totalDurationMinutes:
            (topFlights[0]?.totalDurationMinutes ?? 0) + driving.durationMinutes,
          airport,
        });
      } catch (err) {
        return buildRouteOption({
          id: `alt-${airport.iataCode}`,
          type: "alternative",
          label: `Fly to ${airport.iataCode} + Drive`,
          origin,
          flightDestination: airport.iataCode,
          finalDestination: destination,
          topFlights: [],
          drivingMiles: airport.distanceMiles,
          drivingDurationMinutes: Math.round((airport.distanceMiles / 55) * 60),
          drivingCost: estimateDrivingCost(airport.distanceMiles),
          flightCost: 0,
          totalDurationMinutes: 0,
          airport,
          error: err instanceof Error ? err.message : "Search failed",
        });
      }
    }
  );

  const allRoutes = applySavings([directRoute, ...altResults]);

  return {
    criteria,
    directRoute: allRoutes[0],
    alternativeRoutes: allRoutes.slice(1),
    allRoutes,
    destinationCoords: destCoords,
    nearbyAirports,
    searchedAt: new Date().toISOString(),
  };
}

export async function estimateSearch(criteria: SearchCriteria): Promise<{
  datePairCount: number;
  possibleDatePairCount: number;
  routeTargetCount: number;
  scanCredits: number;
  detailCredits: number;
  maxCredits: number;
  cappedDatePairs: boolean;
}> {
  const destination = criteria.destination.toUpperCase();
  const destCoords = resolveAirportCoords(destination);
  const nearbyAirports = await findNearbyAirportsForDestination(
    destination,
    destCoords,
    criteria.radiusMiles
  );
  const alternativeTargets = nearbyAirports.filter(
    (ap) => ap.iataCode !== destination
  );
  const dateMatrixPlan = buildDateMatrixPlan({
    startDate: criteria.dateRangeStart,
    endDate: criteria.dateRangeEnd,
    minDuration: criteria.tripDurationMin,
    maxDuration: criteria.tripDurationMax,
    searchDepth: criteria.searchDepth ?? "smart",
  });
  const credits = estimateSerpApiCredits({
    routeTargetCount: 1 + alternativeTargets.length,
    datePairCount:
      dateMatrixPlan.estimatedQueryCount ?? dateMatrixPlan.selectedPairs.length,
    useMultiAirport: true,
  });
  const estimatedDatePairCount =
    dateMatrixPlan.estimatedQueryCount ?? dateMatrixPlan.selectedPairs.length;
  return {
    datePairCount: Math.min(estimatedDatePairCount, dateMatrixPlan.totalPairs),
    possibleDatePairCount: dateMatrixPlan.totalPairs,
    routeTargetCount: 1 + alternativeTargets.length,
    cappedDatePairs: estimatedDatePairCount < dateMatrixPlan.totalPairs,
    ...credits,
  };
}

export async function getNearbyAirportsPreview(
  destination: string,
  radiusMiles: number
): Promise<{ airports: AirportInfo[]; coords: Coordinates }> {
  const coords = resolveAirportCoords(destination);
  const airports = findNearbyAirports(coords, radiusMiles, destination).slice(
    0,
    MAX_ALTERNATIVES
  );
  return { airports, coords };
}
