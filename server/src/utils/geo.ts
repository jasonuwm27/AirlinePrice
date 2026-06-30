/** Haversine distance in miles between two coordinates */
export function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Parse ISO 8601 duration (PT2H30M) to minutes */
export function parseDurationToMinutes(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] ?? "0", 10);
  const minutes = parseInt(match[2] ?? "0", 10);
  return hours * 60 + minutes;
}

/** Pick a representative departure date within the flexible range */
export function pickSearchDate(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const mid = new Date((startDate.getTime() + endDate.getTime()) / 2);
  return mid.toISOString().split("T")[0];
}

/** Calculate return date based on trip duration midpoint */
export function pickReturnDate(
  departureDate: string,
  durationMin: number,
  durationMax: number
): string {
  const days = Math.round((durationMin + durationMax) / 2);
  const dep = new Date(departureDate);
  dep.setDate(dep.getDate() + days);
  return dep.toISOString().split("T")[0];
}

/** Run async tasks with concurrency limit and delay between batches */
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  delayMs: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);

    if (i + concurrency < items.length && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return results;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
