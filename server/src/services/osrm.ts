import type { Coordinates } from "../types/index.js";
import { haversineMiles } from "../utils/geo.js";

interface OsrmRouteResponse {
  routes: Array<{
    distance: number;
    duration: number;
  }>;
  code: string;
}

const OSRM_BASE = "https://router.project-osrm.org";

/**
 * Get driving distance in miles between two coordinates using OSRM.
 * Falls back to straight-line haversine * 1.3 road factor if OSRM fails.
 */
export async function getDrivingDistanceMiles(
  from: Coordinates,
  to: Coordinates
): Promise<{ miles: number; durationMinutes: number }> {
  const url =
    `${OSRM_BASE}/route/v1/driving/` +
    `${from.lon},${from.lat};${to.lon},${to.lat}` +
    `?overview=false`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

    const data = (await res.json()) as OsrmRouteResponse;
    if (data.code !== "Ok" || !data.routes.length) {
      throw new Error("No route found");
    }

    const route = data.routes[0];
    return {
      miles: route.distance / 1609.34,
      durationMinutes: Math.round(route.duration / 60),
    };
  } catch {
    const straightLine = haversineMiles(from.lat, from.lon, to.lat, to.lon);
    return {
      miles: straightLine * 1.3,
      durationMinutes: Math.round((straightLine * 1.3) / 55 * 60),
    };
  }
}

export function getCostPerMile(): number {
  return parseFloat(process.env.COST_PER_MILE ?? "0.20");
}

export function estimateDrivingCost(miles: number): number {
  return Math.round(miles * getCostPerMile() * 100) / 100;
}
