export interface DatePair {
  departureDate: string;
  returnDate: string;
  tripDurationDays: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseIsoDate(date: string): Date {
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

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function generateDateMatrix(params: {
  startDate: string;
  endDate: string;
  minDuration: number;
  maxDuration: number;
}): DatePair[] {
  const start = parseIsoDate(params.startDate);
  const end = parseIsoDate(params.endDate);
  const minDuration = Math.max(1, Math.floor(params.minDuration));
  const maxDuration = Math.max(minDuration, Math.floor(params.maxDuration));

  if (end < start) {
    throw new Error("The end date must be on or after the start date.");
  }

  const pairs: DatePair[] = [];

  for (
    let departure = start;
    departure <= end;
    departure = addDays(departure, 1)
  ) {
    for (let duration = minDuration; duration <= maxDuration; duration += 1) {
      pairs.push({
        departureDate: formatIsoDate(departure),
        returnDate: formatIsoDate(addDays(departure, duration)),
        tripDurationDays: duration,
      });
    }
  }

  return pairs;
}
