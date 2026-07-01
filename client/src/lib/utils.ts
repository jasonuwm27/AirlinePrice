import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatMiles(miles: number): string {
  return `${Math.round(miles)} mi`;
}

export function todayIsoDate(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseIsoDateLocal(date: string): Date | null {
  const [year, month, day] = date.split("-").map(Number);
  if ([year, month, day].some((value) => Number.isNaN(value))) return null;
  return new Date(year, month - 1, day);
}

export function formatIsoDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function compareIsoDates(a: string, b: string): number {
  return a.localeCompare(b);
}

export function calculateTripDurationDays(
  departureDate?: string,
  returnDate?: string
): number | null {
  if (!departureDate || !returnDate) return null;

  const [departureYear, departureMonth, departureDay] = departureDate
    .split("-")
    .map(Number);
  const [returnYear, returnMonth, returnDay] = returnDate.split("-").map(Number);

  if (
    [departureYear, departureMonth, departureDay, returnYear, returnMonth, returnDay].some(
      (value) => Number.isNaN(value)
    )
  ) {
    return null;
  }

  const departureUtc = Date.UTC(departureYear, departureMonth - 1, departureDay);
  const returnUtc = Date.UTC(returnYear, returnMonth - 1, returnDay);
  const durationDays = Math.round(
    (returnUtc - departureUtc) / (1000 * 60 * 60 * 24)
  );

  return durationDays > 0 ? durationDays : null;
}

export function formatShortDate(date: string): string {
  const parsed = parseIsoDateLocal(date);
  if (!parsed) return date;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(parsed);
}

/** Format driving duration in minutes to a human-friendly string like "1 hr 15 mins" */
export function formatDrivingTime(minutes: number): string {
  if (minutes <= 0) return "0 mins";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min${m !== 1 ? "s" : ""}`;
  if (m === 0) return `${h} hr${h !== 1 ? "s" : ""}`;
  return `${h} hr${h !== 1 ? "s" : ""} ${m} min${m !== 1 ? "s" : ""}`;
}
