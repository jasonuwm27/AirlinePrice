/**
 * Multi-airport SerpAPI search service.
 *
 * Queries SerpAPI's Google Flights engine with up to 5 comma-separated
 * IATA codes in `arrival_id` and extracts flight offers + price insights.
 *
 * Accepts a city-name query (via `resolveAirportByQuery`) and supports
 * filtering nearby airports by either miles or estimated driving hours.
 */

import { findAirportsInRadius } from "../utils/distance.js";
import { scoreAndRankFlights } from "../utils/scoring.js";
import { resolveAirportByQuery } from "./airports.js";
import { mapSerpApiFlight } from "./flightMapper.js";
import type {
  MultiAirportFlightOffer,
  MultiAirportSearchParams,
  NearbyAirportResult,
  PriceInsight,
  SearchFlightsResponse,
  SerpApiFlightsResponse,
} from "../types/index.js";

const SERPAPI_BASE = "https://serpapi.com/search";
const MAX_AIRPORTS = 5;
const MAX_RESULTS = 25;
const MAX_RETURN_LOOKUPS = parseInt(
  process.env.SERPAPI_RETURN_LOOKUPS ?? String(MAX_RESULTS),
  10
);
const MAX_RETURN_CONCURRENT = parseInt(
  process.env.SERPAPI_RETURN_CONCURRENT ?? "3",
  10
);

/**
 * Retrieve and validate the SerpAPI key from environment.
 * Throws immediately with a clear message if missing.
 */
function getApiKey(): string {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) {
    throw new Error(
      "SerpAPI key not configured. Set SERPAPI_API_KEY in server/.env " +
        "(get one at https://serpapi.com/dashboard)"
    );
  }
  return key;
}

/**
 * Extract price insight data from the SerpAPI response.
 * Returns null when the API doesn't provide price insights for a route.
 */
function extractPriceInsights(
  data: SerpApiFlightsResponse
): PriceInsight | null {
  const pi = data.price_insights;
  if (!pi) return null;

  return {
    lowestPrice: pi.lowest_price ?? null,
    priceLevel: pi.price_level ?? null,
    typicalPriceRange: pi.typical_price_range ?? null,
    priceHistory: pi.price_history ?? null,
  };
}

function getFlightResults(data: SerpApiFlightsResponse) {
  return [...(data.best_flights ?? []), ...(data.other_flights ?? [])];
}

function buildUrl(queryParams: Record<string, string>): string {
  const url = new URL(SERPAPI_BASE);
  for (const [key, value] of Object.entries(queryParams)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function fetchSerpApi(
  queryParams: Record<string, string>
): Promise<SerpApiFlightsResponse> {
  const res = await fetch(buildUrl(queryParams));

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `SerpAPI request failed (HTTP ${res.status}): ${text.slice(0, 300)}`
    );
  }

  const data = (await res.json()) as SerpApiFlightsResponse;

  if (data.error) {
    throw new Error(`SerpAPI error: ${data.error}`);
  }

  if (data.search_metadata?.status === "Error") {
    throw new Error(
      `SerpAPI search failed: ${data.search_metadata?.json_endpoint ?? "unknown error"}`
    );
  }

  return data;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R | null>
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const mapped = await mapper(items[index], index);
      if (mapped) results.push(mapped);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

/**
 * Map raw SerpAPI flight results to MultiAirportFlightOffer objects.
 * Each offer is tagged with its arrival airport IATA code (the last
 * segment's arrival airport) so the frontend can identify which nearby
 * airport each offer flies into.
 */
async function mapFlightOffers(
  data: SerpApiFlightsResponse,
  departureDate: string,
  returnDate: string | undefined,
  baseQueryParams: Record<string, string>
): Promise<MultiAirportFlightOffer[]> {
  const allResults = getFlightResults(data);

  const currency = data.search_parameters?.currency ?? "USD";

  if (returnDate) {
    const candidates = allResults
      .filter((result) => Boolean(result.departure_token))
      .slice(0, Math.max(1, MAX_RETURN_LOOKUPS));

    const mappedRoundTrips = await mapWithConcurrency(
      candidates,
      Math.max(1, MAX_RETURN_CONCURRENT),
      async (result, index) => {
        try {
          const returnData = await fetchSerpApi({
            ...baseQueryParams,
            departure_token: result.departure_token as string,
          });
          const inboundResult = getFlightResults(returnData)[0];

          if (!inboundResult) return null;

          const base = mapSerpApiFlight(
            result,
            index,
            departureDate,
            returnDate,
            returnData.search_parameters?.currency ?? currency,
            inboundResult
          );

          const lastSegment = result.flights.at(-1);
          const arrivalAirportIata = lastSegment?.arrival_airport.id ?? "???";

          return {
            ...base,
            arrivalAirportIata,
          };
        } catch {
          return null;
        }
      }
    );

    return scoreAndRankFlights(mappedRoundTrips, MAX_RESULTS) as MultiAirportFlightOffer[];
  }

  const mapped = allResults.map((result, index) => {
    const base = mapSerpApiFlight(result, index, departureDate, undefined, currency);
    const lastSegment = result.flights.at(-1);
    const arrivalAirportIata = lastSegment?.arrival_airport.id ?? "???";

    return { ...base, arrivalAirportIata };
  });

  return scoreAndRankFlights(mapped, MAX_RESULTS) as MultiAirportFlightOffer[];
}

/**
 * Core search function: resolves a destination query to an airport,
 * finds nearby airports within the user's chosen threshold, queries
 * SerpAPI with a multi-airport arrival_id, and returns the aggregated
 * response.
 *
 * @throws AirportNotFoundError if the destination query doesn't match any airport
 * @throws NoAirportsFoundError if no airports are found within the threshold
 * @throws Error if SerpAPI key is missing or API call fails
 */
export async function searchFlightsMultiAirport(
  params: MultiAirportSearchParams
): Promise<SearchFlightsResponse> {
  // 1. Resolve city/airport query → AirportRecord
  const resolvedAirport = resolveAirportByQuery(params.destinationQuery);

  if (!resolvedAirport) {
    throw new AirportNotFoundError(
      `No airport found matching "${params.destinationQuery}". ` +
        `Check your spelling or add a new entry to server/src/data/airports.json using this format:\n` +
        `{"iata":"XYZ","name":"Name","city":"City","country":"Country","lat":0.0,"lon":0.0}`
    );
  }

  // 2. Find airports within threshold
  const nearbyAirports: NearbyAirportResult[] = findAirportsInRadius(
    resolvedAirport.lat,
    resolvedAirport.lon,
    params.filterType,
    params.maxThreshold,
    MAX_AIRPORTS
  );

  if (nearbyAirports.length === 0) {
    throw new NoAirportsFoundError(
      `No airports found within ${params.maxThreshold} ` +
        `${params.filterType === "hours" ? "driving hours" : "miles"} of ` +
        `"${params.destinationQuery}" (resolved to ${resolvedAirport.name}, ` +
        `${resolvedAirport.city}). Try increasing your threshold or choosing ` +
        `a different destination.`
    );
  }

  // 3. Build comma-separated arrival_id string (e.g. "ORD,MDW,MKE")
  //    Sanitize each code to strict uppercase 3-letter IATA format
  const arrivalId = nearbyAirports
    .map((a) => a.iataCode.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))
    .join(",");

  // 4. Build SerpAPI query parameters
  const queryParams: Record<string, string> = {
    engine: "google_flights",
    api_key: getApiKey(),
    departure_id: params.departureId.toUpperCase(),
    arrival_id: arrivalId,
    outbound_date: params.departureDate,
    type: params.returnDate ? "1" : "2", // 1 = round trip, 2 = one way
    currency: "USD",
    hl: "en",
    gl: "us",
  };

  if (params.returnDate) {
    queryParams.return_date = params.returnDate;
  }

  // Always use deep_search to ensure regional airports (e.g. BTR) return data
  queryParams.deep_search = "true";

  // 5. Execute SerpAPI request
  let data: SerpApiFlightsResponse;

  try {
    data = await fetchSerpApi(queryParams);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("SerpAPI request failed")) {
      throw err; // re-throw our own formatted error
    }
    throw new Error(
      `Network error contacting SerpAPI: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 6. Build response
  const flights = await mapFlightOffers(
    data,
    params.departureDate,
    params.returnDate,
    queryParams
  );
  const priceInsights = extractPriceInsights(data);

  return {
    nearbyAirports,
    flights,
    priceInsights,
    searchedAt: new Date().toISOString(),
    meta: {
      departureId: params.departureId.toUpperCase(),
      destinationQuery: params.destinationQuery,
      resolvedAirport,
      filterType: params.filterType,
      maxThreshold: params.maxThreshold,
      departureDate: params.departureDate,
      returnDate: params.returnDate,
      arrivalIdUsed: arrivalId,
    },
  };
}

/**
 * Custom error class for the "no airports found within threshold" case.
 * Lets the route handler distinguish this from other errors
 * and return a 404 instead of 500.
 */
export class NoAirportsFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoAirportsFoundError";
  }
}

/**
 * Custom error class for the "destination query doesn't match any airport" case.
 * Returns a 404 with instructions on how to add a new airport to the dataset.
 */
export class AirportNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AirportNotFoundError";
  }
}
