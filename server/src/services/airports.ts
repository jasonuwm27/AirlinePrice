import airportsData from "../data/airports.json" with { type: "json" };
import type { AirportInfo, AirportRecord, Coordinates, LocationSuggestion } from "../types/index.js";
import { haversineMiles } from "../utils/geo.js";

const airports = airportsData as AirportRecord[];

const byIata = new Map(airports.map((a) => [a.iata.toUpperCase(), a]));

export function searchLocations(keyword: string): LocationSuggestion[] {
  const q = keyword.trim().toLowerCase();

  const matched = airports.filter(
    (a) =>
      (a.iata && a.iata.toLowerCase().includes(q)) ||
      (a.name && a.name.toLowerCase().includes(q)) ||
      (a.city && a.city.toLowerCase().includes(q))
  );

  matched.sort((a, b) => {
    // Exact IATA match
    const aExactIata = a.iata && a.iata.toLowerCase() === q ? 1 : 0;
    const bExactIata = b.iata && b.iata.toLowerCase() === q ? 1 : 0;
    if (aExactIata !== bExactIata) return bExactIata - aExactIata;

    // Starts with IATA
    const aStartsIata = a.iata && a.iata.toLowerCase().startsWith(q) ? 1 : 0;
    const bStartsIata = b.iata && b.iata.toLowerCase().startsWith(q) ? 1 : 0;
    if (aStartsIata !== bStartsIata) return bStartsIata - aStartsIata;

    // Starts with City
    const aStartsCity = a.city && a.city.toLowerCase().startsWith(q) ? 1 : 0;
    const bStartsCity = b.city && b.city.toLowerCase().startsWith(q) ? 1 : 0;
    if (aStartsCity !== bStartsCity) return bStartsCity - aStartsCity;

    return 0;
  });

  return matched
    .slice(0, 10)
    .map((a) => ({
      iataCode: a.iata,
      name: a.name,
      cityName: a.city,
      countryName: a.country,
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
  const q = query.trim().toLowerCase();
  if (!q) return null;

  // 1. Exact IATA code
  const byCode = byIata.get(q.toUpperCase());
  if (byCode) return byCode;

  // 2. Exact city name
  const exactCity = airports.find(
    (a) => a.city.toLowerCase() === q
  );
  if (exactCity) return exactCity;

  // 3. Partial city name
  const partialCity = airports.find(
    (a) => a.city.toLowerCase().includes(q)
  );
  if (partialCity) return partialCity;

  // 4. Partial airport name
  const partialName = airports.find(
    (a) => a.name.toLowerCase().includes(q)
  );
  if (partialName) return partialName;

  return null;
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
