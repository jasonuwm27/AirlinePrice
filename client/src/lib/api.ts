import type { LocationSuggestion, SearchCriteria, SearchResponse } from "@/types";

const API_BASE = "/api";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function searchFlights(criteria: SearchCriteria): Promise<SearchResponse> {
  return fetchJson<SearchResponse>(`${API_BASE}/search`, {
    method: "POST",
    body: JSON.stringify(criteria),
  });
}

export async function suggestLocations(keyword: string): Promise<LocationSuggestion[]> {
  if (keyword.length < 2) return [];
  const params = new URLSearchParams({ keyword });
  const data = await fetchJson<{ suggestions: LocationSuggestion[] }>(
    `${API_BASE}/locations?${params}`
  );
  return data.suggestions;
}

export async function getNearbyAirports(
  destination: string,
  radiusMiles: number
): Promise<{ airports: LocationSuggestion[]; coords: { lat: number; lon: number } }> {
  const params = new URLSearchParams({
    destination,
    radius: String(radiusMiles),
  });
  return fetchJson(`${API_BASE}/airports/nearby?${params}`);
}
