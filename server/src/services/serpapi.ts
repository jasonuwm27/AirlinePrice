/**
 * Efficient SerpAPI Google Flights client.
 *
 * The high-credit operation is fetching return-flight details with
 * departure_token. This client scans the date matrix first, groups/scores the
 * large outbound pool, then hydrates only the best few grouped cards.
 */

import type {
  ScoredFlightOffer,
  SerpApiFlightResult,
  SerpApiFlightsResponse,
} from "../types/index.js";
import {
  attachInboundSerpApiFlight,
  mapSerpApiFlight,
  mapSerpApiResults,
} from "./flightMapper.js";
import {
  addDays,
  formatIsoDate,
  generateAnchorDatePairs,
  generateDenseDatePairsAroundAnchor,
  generateDateMatrix,
  generateDateMatrixResult,
  generateSparseGridDatePairs,
  parseIsoDate,
  type DateMatrixResult,
  type DatePair,
} from "../utils/dateMatrix.js";
import { runLimited } from "../utils/concurrency.js";
import { groupAndScoreFlights } from "../utils/flightGrouping.js";
import { scoreAndRankFlights } from "../utils/scoring.js";

const SERPAPI_BASE = "https://serpapi.com/search";
const MAX_IATA_PER_PARAM = 4;
const MAX_RESULTS = parseInt(process.env.SERPAPI_MAX_RESULTS ?? "25", 10);
const MAX_DATE_PAIRS = parseInt(process.env.SERPAPI_MAX_DATE_PAIRS ?? "30", 10);
const EXPANDED_MAX_DATE_PAIRS = parseInt(
  process.env.SERPAPI_EXPANDED_MAX_DATE_PAIRS ?? "90",
  10
);
const MAX_DETAIL_HYDRATIONS = parseInt(
  process.env.SERPAPI_MAX_DETAIL_HYDRATIONS ?? "20",
  10
);
const MAX_DATE_PAIR_CONCURRENT = parseInt(
  process.env.SERPAPI_DATE_PAIR_CONCURRENT ?? "2",
  10
);
const MAX_DETAIL_CONCURRENT = parseInt(
  process.env.SERPAPI_DETAIL_CONCURRENT ?? "3",
  10
);
const CACHE_TTL_MS = parseInt(
  process.env.SERPAPI_CACHE_TTL_MS ?? String(12 * 60 * 60 * 1000),
  10
);

interface CacheEntry {
  expiresAt: number;
  data: SerpApiFlightsResponse;
}

const responseCache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 500;

// Periodic cache cleanup — evict expired entries every 10 minutes (HIGH-1)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of responseCache) {
    if (entry.expiresAt <= now) {
      responseCache.delete(key);
    }
  }
}, 10 * 60 * 1000).unref();

export function getApiKey(): string {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) {
    throw new Error(
      "SerpAPI key not configured. Set SERPAPI_API_KEY in server/.env (get one at https://serpapi.com/dashboard)"
    );
  }
  return key;
}

export function sanitizeIata(value: string): string {
  const sanitized = value.toUpperCase().replace(/[^A-Z]/g, "");
  if (!/^[A-Z]{3}$/.test(sanitized)) {
    throw new Error(`Invalid airport code. Expected a 3-letter IATA code.`);
  }
  return sanitized;
}

function sanitizeIataList(values: string[]): string[] {
  return Array.from(new Set(values.map(sanitizeIata)));
}

export function buildMultiAirportString(
  values: string[],
  maxAirports = MAX_IATA_PER_PARAM
): string {
  return sanitizeIataList(values).slice(0, maxAirports).join(",");
}

export function maxIataPerSerpApiParam(): number {
  return MAX_IATA_PER_PARAM;
}

export function getFlightResults(data: SerpApiFlightsResponse): SerpApiFlightResult[] {
  return [...(data.best_flights ?? []), ...(data.other_flights ?? [])];
}

export function buildSerpApiUrl(queryParams: Record<string, string>): string {
  const url = new URL(SERPAPI_BASE);
  for (const [key, value] of Object.entries(queryParams)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function cacheKey(queryParams: Record<string, string>): string {
  const departure = queryParams.departure_id ?? "";
  const arrival = queryParams.arrival_id ?? "";
  const outbound = queryParams.outbound_date ?? "";
  const returnDate = queryParams.return_date ?? "oneway";
  const token = queryParams.departure_token;

  if (token) {
    return `FLIGHT_DETAILS_${departure}_${arrival}_${outbound}_${returnDate}_${token}`;
  }

  return `FLIGHTS_${departure}_${arrival}_${outbound}_${returnDate}`;
}

export async function fetchSerpApi(
  queryParams: Record<string, string>
): Promise<SerpApiFlightsResponse> {
  const key = cacheKey(queryParams);
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const res = await fetch(buildSerpApiUrl(queryParams));

  // ── HTTP 429 — SerpAPI rate limit (HIGH-5) ──
  if (res.status === 429) {
    throw new Error(
      "SerpAPI rate limit reached. Please wait a few minutes and try again."
    );
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SerpAPI request failed: ${res.status} ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as SerpApiFlightsResponse;

  if (data.error) {
    throw new Error(data.error);
  }

  if (data.search_metadata?.status === "Error") {
    throw new Error(data.search_metadata?.json_endpoint ?? "SerpAPI search failed");
  }

  // ── Cache with eviction cap (HIGH-1) ──
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) responseCache.delete(oldestKey);
  }

  responseCache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    data,
  });

  return data;
}

function baseQueryParams(params: {
  origins: string[];
  destinations: string[];
  departureDate: string;
  returnDate?: string;
  adults: number;
}): Record<string, string> {
  const queryParams: Record<string, string> = {
    engine: "google_flights",
    api_key: getApiKey(),
    departure_id: buildMultiAirportString(params.origins),
    arrival_id: buildMultiAirportString(params.destinations),
    outbound_date: params.departureDate,
    type: params.returnDate ? "1" : "2",
    currency: "USD",
    hl: "en",
    gl: "us",
    adults: String(params.adults),
    deep_search: "true",
    show_hidden: "true",
  };

  if (params.returnDate) {
    queryParams.return_date = params.returnDate;
  }

  return queryParams;
}

async function scanFlightOffersForDatePair(params: {
  origins: string[];
  destinations: string[];
  departureDate: string;
  returnDate?: string;
  adults: number;
}): Promise<ScoredFlightOffer[]> {
  const queryParams = baseQueryParams(params);
  const data = await fetchSerpApi(queryParams);
  const allResults = getFlightResults(data);
  const currency = data.search_parameters?.currency ?? "USD";

  if (allResults.length === 0) return [];

  return mapSerpApiResults(
    allResults,
    params.departureDate,
    params.returnDate,
    currency
  );
}

async function hydrateRoundTripOffer(
  flight: ScoredFlightOffer,
  adults: number
): Promise<ScoredFlightOffer> {
  if (!flight.returnDate || !flight.departureToken) return flight;

  const origin = flight.outbound.segments[0]?.departureAirport;
  const destination =
    flight.arrivalAirportIata ?? flight.outbound.segments.at(-1)?.arrivalAirport;

  if (!origin || !destination) return flight;

  try {
    const data = await fetchSerpApi({
      ...baseQueryParams({
        origins: [origin],
        destinations: [destination],
        departureDate: flight.departureDate,
        returnDate: flight.returnDate,
        adults,
      }),
      departure_token: flight.departureToken,
    });
    const inboundResult = getFlightResults(data)[0];

    if (!inboundResult) return flight;

    const hydrated = attachInboundSerpApiFlight(
      flight,
      inboundResult,
      data.search_parameters?.currency ?? flight.currency
    );

    return {
      ...hydrated,
      totalScore: flight.totalScore,
      priceScore: flight.priceScore,
      qualityScore: flight.qualityScore,
      dealLabel: flight.dealLabel,
      dealEmoji: flight.dealEmoji,
      priceVsAverage: flight.priceVsAverage,
      confidence: flight.confidence,
      prediction: flight.prediction,
    };
  } catch (err) {
    console.warn(`Hydrate round-trip failed for ${flight.departureDate}:`, err);
    return flight;
  }
}

export function buildCappedDatePairs(params: {
  startDate: string;
  endDate: string;
  minDuration: number;
  maxDuration: number;
  searchDepth?: "smart" | "expanded" | "full";
}): DatePair[] {
  if ((params.searchDepth ?? "smart") === "expanded") {
    return generateSparseGridDatePairs({
      startDate: params.startDate,
      endDate: params.endDate,
      minDuration: params.minDuration,
      maxDuration: params.maxDuration,
      maxPairs: 40,
    });
  }

  return generateDateMatrix({
    startDate: params.startDate,
    endDate: params.endDate,
    minDuration: params.minDuration,
    maxDuration: params.maxDuration,
    maxPairs: maxDatePairsForDepth(params.searchDepth),
  });
}

export function buildDateMatrixPlan(params: {
  startDate: string;
  endDate: string;
  minDuration: number;
  maxDuration: number;
  searchDepth?: "smart" | "expanded" | "full";
}): DateMatrixResult {
  if ((params.searchDepth ?? "smart") === "smart") {
    const full = generateDateMatrixResult({
      startDate: params.startDate,
      endDate: params.endDate,
      minDuration: params.minDuration,
      maxDuration: params.maxDuration,
    });
    const anchorPairs = generateAnchorDatePairs({
      startDate: params.startDate,
      endDate: params.endDate,
      minDuration: params.minDuration,
      maxDuration: params.maxDuration,
    });
    const maxDensePairs = 5 * (
      Math.max(1, Math.floor(params.maxDuration)) -
      Math.max(1, Math.floor(params.minDuration)) +
      1
    );
    const estimatedSmartPairs = anchorPairs.length + maxDensePairs;

    return {
      allPairs: full.allPairs,
      selectedPairs: anchorPairs,
      totalPairs: full.totalPairs,
      estimatedQueryCount: estimatedSmartPairs,
    } as DateMatrixResult & { estimatedQueryCount: number };
  }

  if ((params.searchDepth ?? "smart") === "expanded") {
    const full = generateDateMatrixResult({
      startDate: params.startDate,
      endDate: params.endDate,
      minDuration: params.minDuration,
      maxDuration: params.maxDuration,
    });
    const selectedPairs = generateSparseGridDatePairs({
      startDate: params.startDate,
      endDate: params.endDate,
      minDuration: params.minDuration,
      maxDuration: params.maxDuration,
      maxPairs: 40,
    });

    return {
      allPairs: full.allPairs,
      selectedPairs,
      totalPairs: full.totalPairs,
    };
  }

  return generateDateMatrixResult({
    startDate: params.startDate,
    endDate: params.endDate,
    minDuration: params.minDuration,
    maxDuration: params.maxDuration,
    maxPairs: maxDatePairsForDepth(params.searchDepth),
  });
}

export function buildOneWayDatePlan(params: {
  startDate: string;
  endDate: string;
  searchDepth?: "smart" | "expanded" | "full";
}): DateMatrixResult {
  const today = parseIsoDate(new Date().toISOString().slice(0, 10));
  const start = new Date(
    Math.max(parseIsoDate(params.startDate).getTime(), today.getTime())
  );
  const end = parseIsoDate(params.endDate);

  if (end < start) {
    return { allPairs: [], selectedPairs: [], totalPairs: 0 };
  }

  const allPairs: DatePair[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const departureDate = formatIsoDate(date);
    allPairs.push({
      departureDate,
      returnDate: "",
      tripDurationDays: 0,
    });
  }

  const depth = params.searchDepth ?? "smart";
  const maxPairs =
    depth === "full"
      ? Number.POSITIVE_INFINITY
      : depth === "expanded"
        ? Math.min(EXPANDED_MAX_DATE_PAIRS, 40)
        : MAX_DATE_PAIRS;
  const step = depth === "smart" ? 4 : depth === "expanded" ? 2 : 1;
  const steppedPairs = allPairs.filter((_, index) => index % step === 0);
  const selectedPairs =
    Number.isFinite(maxPairs) && steppedPairs.length > maxPairs
      ? steppedPairs.slice(0, maxPairs)
      : steppedPairs;

  return {
    allPairs,
    selectedPairs,
    totalPairs: allPairs.length,
  };
}

function maxDatePairsForDepth(depth: "smart" | "expanded" | "full" = "smart"): number {
  if (depth === "full") return Number.POSITIVE_INFINITY;
  if (depth === "expanded") return EXPANDED_MAX_DATE_PAIRS;
  return MAX_DATE_PAIRS;
}

export function estimateSerpApiCredits(params: {
  routeTargetCount: number;
  datePairCount: number;
  useMultiAirport?: boolean;
  includeDetailCredits?: boolean;
}): {
  scanCredits: number;
  detailCredits: number;
  maxCredits: number;
} {
  const routeMultiplier = params.useMultiAirport === false
    ? Math.max(1, params.routeTargetCount)
    : 1;
  const scanCredits = params.datePairCount * routeMultiplier;
  const detailCredits =
    params.includeDetailCredits !== false && params.datePairCount > 0
      ? Math.min(MAX_DETAIL_HYDRATIONS, MAX_RESULTS)
      : 0;

  return {
    scanCredits,
    detailCredits,
    maxCredits: scanCredits + detailCredits,
  };
}

export function getSerpApiSearchLimits(): {
  maxDatePairs: number;
  expandedMaxDatePairs: number;
  maxDetailHydrations: number;
  maxResults: number;
} {
  return {
    maxDatePairs: MAX_DATE_PAIRS,
    expandedMaxDatePairs: EXPANDED_MAX_DATE_PAIRS,
    maxDetailHydrations: MAX_DETAIL_HYDRATIONS,
    maxResults: MAX_RESULTS,
  };
}

export async function searchFlightOffers(params: {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults: number;
  searchDepth?: "smart" | "expanded" | "full";
}): Promise<ScoredFlightOffer[]> {
  const scanned = await scanFlightOffersForDatePair({
    origins: [params.origin],
    destinations: [params.destination],
    departureDate: params.departureDate,
    returnDate: params.returnDate,
    adults: params.adults,
  });

  if (!params.returnDate) {
    return scoreAndRankFlights(scanned, MAX_RESULTS);
  }

  const grouped = groupAndScoreFlights(scanned, MAX_RESULTS);
  const hydrated = await runLimited(
    grouped.slice(0, MAX_DETAIL_HYDRATIONS),
    Math.max(1, MAX_DETAIL_CONCURRENT),
    (flight) => hydrateRoundTripOffer(flight, params.adults)
  );

  return [...hydrated, ...grouped.slice(MAX_DETAIL_HYDRATIONS)];
}

function cheapestDepartureDate(flights: ScoredFlightOffer[]): string | null {
  if (flights.length === 0) return null;

  const cheapest = [...flights].sort((a, b) => {
    if (a.price !== b.price) return a.price - b.price;
    return a.totalDurationMinutes - b.totalDurationMinutes;
  })[0];

  return cheapest.departureDate;
}

async function scanDatePairs(params: {
  origins: string[];
  destinations: string[];
  datePairs: DatePair[];
  adults: number;
  onProgress?: (msg: string) => void;
}): Promise<ScoredFlightOffer[]> {
  const destinations = sanitizeIataList(params.destinations);
  const origins = sanitizeIataList(params.origins);

  let scannedCount = 0;
  const totalCount = params.datePairs.length;

  const batches = await runLimited(
    params.datePairs,
    Math.max(1, MAX_DATE_PAIR_CONCURRENT),
    async (datePair) => {
      try {
        if (params.onProgress) {
          scannedCount++;
          params.onProgress(`Scanning date pair ${scannedCount} of ${totalCount}...`);
        }
        return await scanFlightOffersForDatePair({
          origins,
          destinations,
          departureDate: datePair.departureDate,
          returnDate: datePair.returnDate,
          adults: params.adults,
        });
      } catch (err) {
        console.warn(`Date pair scan failed for ${datePair.departureDate}-${datePair.returnDate}:`, err);
        return [];
      }
    }
  );

  return batches.flat();
}

async function searchSmartAnchorDrillDown(params: {
  origins: string[];
  destinations: string[];
  startDate: string;
  endDate: string;
  minDuration: number;
  maxDuration: number;
  adults: number;
  onProgress?: (msg: string) => void;
}): Promise<ScoredFlightOffer[]> {
  const anchorPairs = generateAnchorDatePairs({
    startDate: params.startDate,
    endDate: params.endDate,
    minDuration: params.minDuration,
    maxDuration: params.maxDuration,
    stepDays: 4,
  });

  const anchorFlights = await scanDatePairs({
    origins: params.origins,
    destinations: params.destinations,
    datePairs: anchorPairs,
    adults: params.adults,
    onProgress: params.onProgress,
  });
  const anchorDepartureDate = cheapestDepartureDate(anchorFlights);

  if (!anchorDepartureDate) return groupAndHydrate(anchorFlights, params.adults, 1, params.onProgress);

  const densePairs = generateDenseDatePairsAroundAnchor({
    startDate: params.startDate,
    endDate: params.endDate,
    anchorDepartureDate,
    minDuration: params.minDuration,
    maxDuration: params.maxDuration,
    radiusDays: 2,
  });
  const anchorKeys = new Set(
    anchorPairs.map((pair) => `${pair.departureDate}_${pair.returnDate}`)
  );
  const incrementalDensePairs = densePairs.filter(
    (pair) => !anchorKeys.has(`${pair.departureDate}_${pair.returnDate}`)
  );
  const denseFlights = await scanDatePairs({
    origins: params.origins,
    destinations: params.destinations,
    datePairs: incrementalDensePairs,
    adults: params.adults,
    onProgress: params.onProgress,
  });

  return groupAndHydrate([...anchorFlights, ...denseFlights], params.adults, 1, params.onProgress);
}

async function groupAndHydrate(
  scannedFlights: ScoredFlightOffer[],
  adults: number,
  resultMultiplier = 1,
  onProgress?: (msg: string) => void
): Promise<ScoredFlightOffer[]> {
  const grouped = groupAndScoreFlights(
    scannedFlights,
    MAX_RESULTS * Math.max(1, resultMultiplier)
  );
  if (onProgress && grouped.length > 0) {
    onProgress("Fetching detailed itineraries for top flights...");
  }
  const hydrated = await runLimited(
    grouped.slice(0, MAX_DETAIL_HYDRATIONS),
    Math.max(1, MAX_DETAIL_CONCURRENT),
    (flight) => hydrateRoundTripOffer(flight, adults)
  );

  return [...hydrated, ...grouped.slice(MAX_DETAIL_HYDRATIONS)];
}

export async function searchFlightMatrixOffers(params: {
  origin?: string;
  origins?: string[];
  destinations: string[];
  startDate: string;
  endDate: string;
  minDuration: number;
  maxDuration: number;
  adults: number;
  searchDepth?: "smart" | "expanded" | "full";
  onProgress?: (msg: string) => void;
}): Promise<ScoredFlightOffer[]> {
  const origins = sanitizeIataList(params.origins ?? [params.origin ?? ""]);

  if ((params.searchDepth ?? "smart") === "smart") {
    return searchSmartAnchorDrillDown({
      origins,
      destinations: params.destinations,
      startDate: params.startDate,
      endDate: params.endDate,
      minDuration: params.minDuration,
      maxDuration: params.maxDuration,
      adults: params.adults,
      onProgress: params.onProgress,
    });
  }

  const datePairs = buildCappedDatePairs({
    startDate: params.startDate,
    endDate: params.endDate,
    minDuration: params.minDuration,
    maxDuration: params.maxDuration,
    searchDepth: params.searchDepth,
  });

  return scanDatePairs({
    origins,
    destinations: params.destinations,
    datePairs,
    adults: params.adults,
    onProgress: params.onProgress,
  }).then((flights) => groupAndHydrate(flights, params.adults, params.destinations.length, params.onProgress));
}
