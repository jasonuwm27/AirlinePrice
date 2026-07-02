import airportsData from "../data/airports.json" with { type: "json" };
import type { AirportInfo, AirportRecord, Coordinates, LocationSuggestion } from "../types/index.js";
import { haversineMiles } from "../utils/geo.js";

const airports = airportsData as AirportRecord[];

const byIata = new Map(airports.map((a) => [a.iata.toUpperCase(), a]));
const primaryAirportBoost = new Map<string, number>([
  ["ATL", 10],
  ["BOS", 8],
  ["CLT", 8],
  ["DEN", 8],
  ["DFW", 9],
  ["DTW", 8],
  ["EWR", 7],
  ["FLL", 6],
  ["HND", 8],
  ["IAD", 7],
  ["IAH", 8],
  ["JFK", 10],
  ["LAS", 8],
  ["LAX", 10],
  ["LGA", 6],
  ["LHR", 10],
  ["MCO", 8],
  ["MIA", 8],
  ["MSP", 8],
  ["NRT", 7],
  ["ORD", 10],
  ["PHL", 8],
  ["PHX", 8],
  ["SEA", 8],
  ["SFO", 9],
  ["SYD", 9],
]);

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost
      );
    }

    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

function fuzzySimilarity(query: string, candidate: string): number {
  if (!query || !candidate) return 0;

  const distance = levenshteinDistance(query, candidate);
  const maxLength = Math.max(query.length, candidate.length);
  return Math.max(0, 1 - distance / maxLength);
}

function bestFieldScore(query: string, value: string, weights: {
  exact: number;
  startsWith: number;
  includes: number;
  fuzzy: number;
}): number {
  const candidate = normalizeSearchText(value);
  if (!candidate) return 0;

  if (candidate === query) return weights.exact;
  if (candidate.startsWith(query)) return weights.startsWith;
  if (candidate.includes(query)) return weights.includes;

  const tokens = candidate.split(" ").filter(Boolean);
  const tokenScore = tokens.reduce((best, token) => {
    if (token === query) return Math.max(best, weights.exact - 5);
    if (token.startsWith(query)) return Math.max(best, weights.startsWith - 5);
    return Math.max(best, fuzzySimilarity(query, token) * weights.fuzzy);
  }, 0);

  return Math.max(tokenScore, fuzzySimilarity(query, candidate) * weights.fuzzy);
}

function scoreAirportMatch(query: string, airport: AirportRecord): number {
  const iataScore = bestFieldScore(query, airport.iata, {
    exact: 120,
    startsWith: 95,
    includes: 70,
    fuzzy: 55,
  });
  const cityScore = bestFieldScore(query, airport.city, {
    exact: 110,
    startsWith: 90,
    includes: 75,
    fuzzy: 92,
  });
  const nameScore = bestFieldScore(query, airport.name, {
    exact: 95,
    startsWith: 80,
    includes: 65,
    fuzzy: 78,
  });
  const countryScore = bestFieldScore(query, airport.country, {
    exact: 45,
    startsWith: 35,
    includes: 25,
    fuzzy: 20,
  });

  const baseScore = Math.max(iataScore, cityScore, nameScore, countryScore);
  const boost =
    cityScore >= 75 || nameScore >= 75
      ? primaryAirportBoost.get(airport.iata.toUpperCase()) ?? 0
      : 0;

  return baseScore + boost;
}

export function searchLocations(keyword: string): LocationSuggestion[] {
  const q = normalizeSearchText(keyword);
  if (q.length < 2) return [];

  const scored = airports
    .map((airport) => ({
      airport,
      score: scoreAirportMatch(q, airport),
    }))
    .filter(({ score }) => score >= 52)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const cityCompare = a.airport.city.localeCompare(b.airport.city);
      if (cityCompare !== 0) return cityCompare;
      return a.airport.iata.localeCompare(b.airport.iata);
    });

  const bestScore = scored[0]?.score ?? 0;
  const minimumUsefulScore = Math.max(52, bestScore - 24);
  const hasPrimaryAirportMatch = scored.some(
    ({ airport, score }) =>
      score >= minimumUsefulScore &&
      primaryAirportBoost.has(airport.iata.toUpperCase())
  );

  return scored
    .filter(({ airport, score }) => {
      if (!hasPrimaryAirportMatch) return score >= minimumUsefulScore;
      if (primaryAirportBoost.has(airport.iata.toUpperCase())) {
        return score >= minimumUsefulScore;
      }
      return score >= Math.max(52, bestScore - 10);
    })
    .slice(0, 10)
    .map(({ airport }) => ({
      iataCode: airport.iata,
      name: airport.name,
      cityName: airport.city,
      countryName: airport.country,
    }));
}

export function resolveAirportCoords(iataCode: string): Coordinates {
  const airport = byIata.get(iataCode.toUpperCase());
  if (!airport) {
    throw new Error(
      `Unknown airport: ${iataCode}. Add it to server/src/data/airports.json or use a supported IATA code.`
    );
  }
  return { lat: airport.lat, lon: airport.lon };
}

/**
 * Resolve a free-text query to an airport record.
 *
 * Matching priority (case-insensitive):
 *   1. Exact IATA code match (e.g. "ORD")
 *   2. Exact city name match (e.g. "Chicago")
 *   3. Partial city name match (e.g. "New Yor")
 *   4. Partial airport name match (e.g. "O'Hare")
 *
 * @returns The best-matching AirportRecord, or null if no match is found.
 */
export function resolveAirportByQuery(query: string): AirportRecord | null {
  const q = normalizeSearchText(query);
  if (!q) return null;

  // 1. Exact IATA code
  const byCode = byIata.get(q.toUpperCase());
  if (byCode) return byCode;

  const [bestMatch] = airports
    .map((airport) => ({
      airport,
      score: scoreAirportMatch(q, airport),
    }))
    .filter(({ score }) => score >= 52)
    .sort((a, b) => b.score - a.score);

  return bestMatch?.airport ?? null;
}

export function getAirportRecord(iataCode: string): AirportRecord | undefined {
  return byIata.get(iataCode.toUpperCase());
}

export function findNearbyAirports(
  coords: Coordinates,
  radiusMiles: number,
  excludeIata?: string
): AirportInfo[] {
  if (radiusMiles <= 0) return [];

  const exclude = excludeIata?.toUpperCase();

  return airports
    .map((a) => {
      const distanceMiles = haversineMiles(coords.lat, coords.lon, a.lat, a.lon);
      if (distanceMiles > radiusMiles || a.iata.toUpperCase() === exclude) return null;
      return {
        iataCode: a.iata,
        name: a.name,
        city: a.city,
        distanceMiles: Math.round(distanceMiles * 10) / 10,
      };
    })
    .filter((a): a is AirportInfo => a !== null)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}
