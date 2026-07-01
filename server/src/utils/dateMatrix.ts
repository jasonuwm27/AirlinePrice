export interface DatePair {
  departureDate: string;
  returnDate: string;
  tripDurationDays: number;
}

export interface DateMatrixResult {
  allPairs: DatePair[];
  selectedPairs: DatePair[];
  totalPairs: number;
  estimatedQueryCount?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseIsoDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  if (
    !year ||
    !month ||
    !day ||
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day)
  ) {
    throw new Error(`Invalid date "${date}". Expected YYYY-MM-DD.`);
  }

  return new Date(Date.UTC(year, month - 1, day));
}

export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function normalizeWindow(params: {
  startDate: string;
  endDate: string;
  minDepartureDate?: string;
}): { start: Date; end: Date } | null {
  const minDeparture = parseIsoDate(
    params.minDepartureDate ?? new Date().toISOString().slice(0, 10)
  );
  const start = new Date(
    Math.max(parseIsoDate(params.startDate).getTime(), minDeparture.getTime())
  );
  const end = parseIsoDate(params.endDate);

  if (end < start) return null;
  return { start, end };
}

function normalizeDurations(minDuration: number, maxDuration: number) {
  const min = Math.max(1, Math.floor(minDuration));
  const max = Math.max(min, Math.floor(maxDuration));
  const median = Math.floor((min + max) / 2);
  return { min, median, max };
}

function uniqueDatePairs(pairs: DatePair[]): DatePair[] {
  const seen = new Set<string>();
  const unique: DatePair[] = [];

  for (const pair of pairs) {
    const key = `${pair.departureDate}_${pair.returnDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(pair);
  }

  return unique.sort((a, b) => {
    const dep = a.departureDate.localeCompare(b.departureDate);
    if (dep !== 0) return dep;
    return a.tripDurationDays - b.tripDurationDays;
  });
}

function buildDatePairWithinWindow(
  departure: Date,
  duration: number,
  end: Date
): DatePair | null {
  const returnDate = addDays(departure, duration);
  if (returnDate > end) return null;

  return {
    departureDate: formatIsoDate(departure),
    returnDate: formatIsoDate(returnDate),
    tripDurationDays: duration,
  };
}

export function generateDateMatrix(params: {
  startDate: string;
  endDate: string;
  minDuration: number;
  maxDuration: number;
  minDepartureDate?: string;
  maxPairs?: number;
}): DatePair[] {
  return generateDateMatrixResult(params).selectedPairs;
}

export function sampleDatePairsEvenly(
  allPairs: DatePair[],
  maxPairs: number
): DatePair[] {
  if (allPairs.length <= maxPairs) return allPairs;
  if (maxPairs <= 0) return [];
  if (maxPairs === 1) return [allPairs[0]];

  const selected: DatePair[] = [];
  const used = new Set<number>();
  const lastIndex = allPairs.length - 1;

  for (let i = 0; i < maxPairs; i += 1) {
    const index = Math.round((i * lastIndex) / (maxPairs - 1));
    if (!used.has(index)) {
      used.add(index);
      selected.push(allPairs[index]);
    }
  }

  let backfillIndex = 0;
  while (selected.length < maxPairs && backfillIndex < allPairs.length) {
    if (!used.has(backfillIndex)) {
      used.add(backfillIndex);
      selected.push(allPairs[backfillIndex]);
    }
    backfillIndex += 1;
  }

  return selected.sort((a, b) => {
    const dep = a.departureDate.localeCompare(b.departureDate);
    if (dep !== 0) return dep;
    return a.tripDurationDays - b.tripDurationDays;
  });
}

export function generateDateMatrixResult(params: {
  startDate: string;
  endDate: string;
  minDuration: number;
  maxDuration: number;
  minDepartureDate?: string;
  maxPairs?: number;
}): DateMatrixResult {
  const minDeparture = parseIsoDate(
    params.minDepartureDate ?? new Date().toISOString().slice(0, 10)
  );
  const start = new Date(
    Math.max(parseIsoDate(params.startDate).getTime(), minDeparture.getTime())
  );
  const end = parseIsoDate(params.endDate);
  const minDuration = Math.max(1, Math.floor(params.minDuration));
  const maxDuration = Math.max(minDuration, Math.floor(params.maxDuration));

  if (end < start) {
    return { allPairs: [], selectedPairs: [], totalPairs: 0 };
  }

  const pairs: DatePair[] = [];

  for (
    let departure = start;
    departure <= end;
    departure = addDays(departure, 1)
  ) {
    for (let duration = minDuration; duration <= maxDuration; duration += 1) {
      const pair = buildDatePairWithinWindow(departure, duration, end);
      if (pair) pairs.push(pair);
    }
  }

  const maxPairs = params.maxPairs ?? pairs.length;

  return {
    allPairs: pairs,
    selectedPairs: sampleDatePairsEvenly(pairs, maxPairs),
    totalPairs: pairs.length,
  };
}

export function generateAnchorDatePairs(params: {
  startDate: string;
  endDate: string;
  minDuration: number;
  maxDuration: number;
  minDepartureDate?: string;
  stepDays?: number;
}): DatePair[] {
  const window = normalizeWindow(params);
  if (!window) return [];

  const { median } = normalizeDurations(params.minDuration, params.maxDuration);
  const stepDays = Math.max(1, Math.floor(params.stepDays ?? 4));
  const pairs: DatePair[] = [];

  for (
    let departure = window.start;
    departure <= window.end;
    departure = addDays(departure, stepDays)
  ) {
    const pair = buildDatePairWithinWindow(departure, median, window.end);
    if (pair) pairs.push(pair);
  }

  return pairs;
}

export function generateDenseDatePairsAroundAnchor(params: {
  startDate: string;
  endDate: string;
  anchorDepartureDate: string;
  minDuration: number;
  maxDuration: number;
  minDepartureDate?: string;
  radiusDays?: number;
}): DatePair[] {
  const window = normalizeWindow(params);
  if (!window) return [];

  const { min, max } = normalizeDurations(params.minDuration, params.maxDuration);
  const radiusDays = Math.max(0, Math.floor(params.radiusDays ?? 2));
  const anchor = parseIsoDate(params.anchorDepartureDate);
  const pairs: DatePair[] = [];

  for (let offset = -radiusDays; offset <= radiusDays; offset += 1) {
    const departure = addDays(anchor, offset);
    if (departure < window.start || departure > window.end) continue;

    for (let duration = min; duration <= max; duration += 1) {
      const pair = buildDatePairWithinWindow(departure, duration, window.end);
      if (pair) pairs.push(pair);
    }
  }

  return uniqueDatePairs(pairs);
}

export function generateSparseGridDatePairs(params: {
  startDate: string;
  endDate: string;
  minDuration: number;
  maxDuration: number;
  minDepartureDate?: string;
  departureStepDays?: number;
  maxPairs?: number;
}): DatePair[] {
  const window = normalizeWindow(params);
  if (!window) return [];

  const { min, median, max } = normalizeDurations(
    params.minDuration,
    params.maxDuration
  );
  const durations = Array.from(new Set([min, median, max])).sort((a, b) => a - b);
  const departureStepDays = Math.max(1, Math.floor(params.departureStepDays ?? 2));
  const pairs: DatePair[] = [];

  for (
    let departure = window.start;
    departure <= window.end;
    departure = addDays(departure, departureStepDays)
  ) {
    for (const duration of durations) {
      const pair = buildDatePairWithinWindow(departure, duration, window.end);
      if (pair) pairs.push(pair);
    }
  }

  return sampleDatePairsEvenly(uniqueDatePairs(pairs), params.maxPairs ?? 40);
}
