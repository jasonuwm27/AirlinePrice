/**
 * SerpAPI Google Flights client.
 *
 * For round trips, Google Flights first returns outbound choices. Each
 * outbound choice has a departure_token that must be used to fetch the return
 * choices. We combine the selected outbound with the best available inbound
 * so every round-trip offer has outbound and inbound details.
 */

import type {
  ScoredFlightOffer,
  SerpApiFlightResult,
  SerpApiFlightsResponse,
} from "../types/index.js";
import { mapSerpApiFlight, mapSerpApiResults } from "./flightMapper.js";
import { scoreAndRankFlights } from "../utils/scoring.js";
import { generateDateMatrix } from "../utils/dateMatrix.js";
import { runLimited } from "../utils/concurrency.js";
import { groupAndScoreFlights } from "../utils/flightGrouping.js";

const SERPAPI_BASE = "https://serpapi.com/search";
const MAX_RESULTS = 25;
const MAX_RETURN_LOOKUPS = parseInt(
  process.env.SERPAPI_RETURN_LOOKUPS ?? String(MAX_RESULTS),
  10
);
const MAX_RETURN_CONCURRENT = parseInt(
  process.env.SERPAPI_RETURN_CONCURRENT ?? "3",
  10
);
const MAX_DATE_PAIR_CONCURRENT = parseInt(
  process.env.SERPAPI_DATE_PAIR_CONCURRENT ?? "2",
  10
);

function getApiKey(): string {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) {
    throw new Error(
      "SerpAPI key not configured. Set SERPAPI_API_KEY in server/.env (get one at https://serpapi.com/dashboard)"
    );
  }
  return key;
}

function sanitizeIata(value: string): string {
  const sanitized = value.toUpperCase().replace(/[^A-Z]/g, "");
  if (!/^[A-Z]{3}$/.test(sanitized)) {
    throw new Error(`Invalid airport code "${value}". Expected a 3-letter IATA code.`);
  }
  return sanitized;
}

function getFlightResults(data: SerpApiFlightsResponse): SerpApiFlightResult[] {
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
    throw new Error(`SerpAPI request failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as SerpApiFlightsResponse;

  if (data.error) {
    throw new Error(data.error);
  }

  if (data.search_metadata?.status === "Error") {
    throw new Error(data.search_metadata?.json_endpoint ?? "SerpAPI search failed");
  }

  return data;
}

async function buildRoundTripOffers(
  baseQueryParams: Record<string, string>,
  outboundResults: SerpApiFlightResult[],
  departureDate: string,
  returnDate: string,
  currency: string
): Promise<ScoredFlightOffer[]> {
  const candidates = outboundResults
    .filter((result) => Boolean(result.departure_token))
    .slice(0, Math.max(1, MAX_RETURN_LOOKUPS));

  const mapped = await runLimited(
    candidates,
    Math.max(1, MAX_RETURN_CONCURRENT),
    async (outboundResult, index) => {
      try {
        const data = await fetchSerpApi({
          ...baseQueryParams,
          departure_token: outboundResult.departure_token as string,
        });
        const inboundResult = getFlightResults(data)[0];

        if (!inboundResult) {
          return null;
        }

        return mapSerpApiFlight(
          outboundResult,
          index,
          departureDate,
          returnDate,
          data.search_parameters?.currency ?? currency,
          inboundResult
        );
      } catch {
        return null;
      }
    }
  );

  return mapped.filter((flight): flight is ScoredFlightOffer => Boolean(flight));
}

export async function fetchFlightOffersForDatePair(params: {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults: number;
}): Promise<ScoredFlightOffer[]> {
  const queryParams: Record<string, string> = {
    engine: "google_flights",
    api_key: getApiKey(),
    departure_id: sanitizeIata(params.origin),
    arrival_id: sanitizeIata(params.destination),
    outbound_date: params.departureDate,
    type: params.returnDate ? "1" : "2",
    currency: "USD",
    hl: "en",
    gl: "us",
    adults: String(params.adults),
    deep_search: "true",
  };

  if (params.returnDate) {
    queryParams.return_date = params.returnDate;
  }

  const data = await fetchSerpApi(queryParams);
  const allResults = getFlightResults(data);

  if (allResults.length === 0) {
    return [];
  }

  const currency = data.search_parameters?.currency ?? "USD";

  if (!params.returnDate) {
    return mapSerpApiResults(allResults, params.departureDate, undefined, currency);
  }

  return buildRoundTripOffers(
    queryParams,
    allResults,
    params.departureDate,
    params.returnDate,
    currency
  );
}

export async function searchFlightOffers(params: {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults: number;
}): Promise<ScoredFlightOffer[]> {
  const flights = await fetchFlightOffersForDatePair(params);
  return scoreAndRankFlights(flights, MAX_RESULTS);
}

export async function searchFlightMatrixOffers(params: {
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  minDuration: number;
  maxDuration: number;
  adults: number;
}): Promise<ScoredFlightOffer[]> {
  const datePairs = generateDateMatrix({
    startDate: params.startDate,
    endDate: params.endDate,
    minDuration: params.minDuration,
    maxDuration: params.maxDuration,
  });

  const batches = await runLimited(
    datePairs,
    Math.max(1, MAX_DATE_PAIR_CONCURRENT),
    async (datePair) => {
      try {
        return await fetchFlightOffersForDatePair({
          origin: params.origin,
          destination: params.destination,
          departureDate: datePair.departureDate,
          returnDate: datePair.returnDate,
          adults: params.adults,
        });
      } catch {
        return [];
      }
    }
  );

  return groupAndScoreFlights(batches.flat(), MAX_RESULTS);
}
