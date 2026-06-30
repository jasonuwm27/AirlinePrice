/**
 * Distance utility — Haversine formula, driving-time approximation,
 * and airport radius search with miles/hours toggle.
 *
 * Re-exports the core haversine function from geo.ts and adds
 * convenience functions to find all airports within a given threshold
 * of a target coordinate, sorted closest-first.
 */

import airportsData from "../data/airports.json" with { type: "json" };
import type { AirportRecord, FilterType, NearbyAirportResult } from "../types/index.js";
import { haversineMiles } from "./geo.js";

// Re-export for consumers that want the raw formula
export { haversineMiles } from "./geo.js";

const airports = airportsData as AirportRecord[];

const DEFAULT_MAX_THRESHOLD = 150;
const DEFAULT_FILTER_TYPE: FilterType = "miles";
const DEFAULT_MAX_RESULTS = 5;
const AVG_DRIVING_SPEED_MPH = 50;

/**
 * Estimate driving hours from haversine (straight-line) miles.
 *
 * Uses an average driving speed of 50 mph, which accounts for
 * typical routing detours and moderate traffic conditions.
 *
 * @param miles  Haversine distance in miles
 * @returns Estimated driving time in hours, rounded to 2 decimal places
 */
export function estimateDrivingHours(miles: number): number {
  return Math.round((miles / AVG_DRIVING_SPEED_MPH) * 100) / 100;
}

/**
 * Find all airports within a given threshold of a target coordinate.
 *
 * The threshold is interpreted based on `filterType`:
 * - `"miles"`:  filters by haversine distance ≤ maxThreshold miles
 * - `"hours"`:  filters by estimated driving hours ≤ maxThreshold hours
 *
 * Each result includes **both** `distanceMiles` and `estimatedDrivingHours`
 * so the frontend can display either metric regardless of which filter
 * was used to select them.
 *
 * @param targetLat     Latitude of the target location
 * @param targetLon     Longitude of the target location
 * @param filterType    How to interpret the threshold ("miles" | "hours")
 * @param maxThreshold  Maximum value for the chosen filter metric
 * @param maxResults    Cap on number of results returned (default 5)
 * @returns Array of nearby airports sorted closest-to-farthest by miles
 */
export function findAirportsInRadius(
  targetLat: number,
  targetLon: number,
  filterType: FilterType = DEFAULT_FILTER_TYPE,
  maxThreshold: number = DEFAULT_MAX_THRESHOLD,
  maxResults: number = DEFAULT_MAX_RESULTS
): NearbyAirportResult[] {
  if (maxThreshold <= 0) return [];

  const results: NearbyAirportResult[] = [];

  for (const airport of airports) {
    const distanceMiles =
      Math.round(haversineMiles(targetLat, targetLon, airport.lat, airport.lon) * 10) / 10;
    const drivingHours = estimateDrivingHours(distanceMiles);

    // Apply filter based on the chosen metric
    const passes =
      filterType === "hours"
        ? drivingHours <= maxThreshold
        : distanceMiles <= maxThreshold;

    if (passes) {
      results.push({
        iataCode: airport.iata,
        name: airport.name,
        city: airport.city,
        country: airport.country,
        distanceMiles,
        estimatedDrivingHours: drivingHours,
      });
    }
  }

  // Sort closest-to-farthest by miles, then cap at maxResults
  results.sort((a, b) => a.distanceMiles - b.distanceMiles);
  return results.slice(0, maxResults);
}
