import type {
  LocationSuggestion,
  SearchCriteria,
  SearchEstimate,
  SearchResponse,
} from "@/types";

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

export async function searchFlights(
  criteria: SearchCriteria,
  onProgress?: (msg: string) => void
): Promise<SearchResponse> {
  const res = await fetch(`${API_BASE}/search/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(criteria),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  if (!res.body) {
    throw new Error("No response body returned from server.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: SearchResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process SSE lines
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? ""; // keep the incomplete chunk

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "progress" && onProgress) {
            onProgress(data.message);
          } else if (data.type === "complete") {
            finalResult = data.data;
          } else if (data.type === "error") {
            throw new Error(data.error);
          }
        } catch (err) {
          // Allow the error we just threw to propagate
          if (err instanceof Error && err.message !== "Unexpected end of JSON input") {
            throw err;
          }
        }
      }
    }
  }

  if (!finalResult) {
    throw new Error("Stream closed before completion.");
  }

  return finalResult;
}

export async function estimateSearchCredits(
  criteria: SearchCriteria
): Promise<SearchEstimate> {
  const origin = /^[A-Z]{3}$/.test(criteria.origin) ? criteria.origin : "";
  return fetchJson<SearchEstimate>(`${API_BASE}/search/estimate`, {
    method: "POST",
    body: JSON.stringify({ ...criteria, origin }),
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
