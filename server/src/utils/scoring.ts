/**
 * Flight Scoring & Ranking Engine
 *
 * Multi-factor scoring algorithm that evaluates flights based on:
 *   1. Price vs. batch average  (65% weight)
 *   2. Quality factors           (35% weight)
 *
 * Returns flights sorted by totalScore descending, capped at `maxResults`.
 */

import type {
  DealLabel,
  PricePrediction,
  ScoredFlightOffer,
} from "../types/index.js";

const MAX_RESULTS = 25;
const PRICE_WEIGHT = 0.65;
const QUALITY_WEIGHT = 0.35;

/* ─── Tier Classification ────────────────────────────────────────── */

const PREMIUM_CARRIERS = new Set([
  "Delta Air Lines", "Delta",
  "United Airlines", "United",
  "American Airlines", "American",
  "JetBlue Airways", "JetBlue",
  "Alaska Airlines", "Alaska",
  "Southwest Airlines", "Southwest",
  "Hawaiian Airlines", "Hawaiian",
]);

const BUDGET_CARRIERS = new Set([
  "Spirit Airlines", "Spirit",
  "Frontier Airlines", "Frontier",
  "Allegiant Air", "Allegiant",
  "Sun Country Airlines", "Sun Country",
]);

/* ─── Price Score (0–100) ────────────────────────────────────────── */

function computePriceScores(flights: ScoredFlightOffer[]): void {
  if (flights.length === 0) return;

  const prices = flights.map((f) => f.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const spread = maxPrice - minPrice;

  for (const flight of flights) {
    flight.priceScore =
      spread > 0
        ? Math.round(100 * (1 - (flight.price - minPrice) / spread))
        : 50; // all same price → neutral
  }
}

/* ─── Quality Score (0–100) ──────────────────────────────────────── */

function computeQualityScore(flight: ScoredFlightOffer): number {
  let score = 76;

  // Penalties
  score -= flight.stops * 6;
  score -= flight.layovers.filter((l) => l.isOvernight).length * 12;

  const baselineMinutes = flight.inbound ? 600 : 300;
  const excessMinutes = Math.max(0, flight.totalDurationMinutes - baselineMinutes);
  score -= excessMinutes * 0.05;

  // Bonuses
  if (flight.amenities.baggageIncluded) score += 10;
  if (flight.amenities.wifi) score += 5;
  if (
    flight.amenities.seatPitchInches !== null &&
    flight.amenities.seatPitchInches >= 32
  ) {
    score += 5;
  }
  if (flight.amenities.airlineTier === "premium") score += 8;
  if (flight.amenities.airlineTier === "budget") score -= 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/* ─── Deal Label ─────────────────────────────────────────────────── */

interface DealInfo {
  label: DealLabel;
  emoji: string;
}

function getDealInfo(totalScore: number): DealInfo {
  if (totalScore >= 80) return { label: "Great Deal", emoji: "🔥" };
  if (totalScore >= 60) return { label: "Good Value", emoji: "👍" };
  if (totalScore >= 40) return { label: "Fair Price", emoji: "😐" };
  return { label: "Expensive", emoji: "⚠️" };
}

/* ─── Price vs. Average ──────────────────────────────────────────── */

function computePriceVsAverage(
  price: number,
  avgPrice: number
): string {
  if (avgPrice === 0) return "N/A";
  const pct = Math.round(((avgPrice - price) / avgPrice) * 100);
  if (pct > 0) return `${pct}% below average`;
  if (pct < 0) return `${Math.abs(pct)}% above average`;
  return "At average";
}

/* ─── Confidence ─────────────────────────────────────────────────── */

function computeConfidence(
  batchSize: number,
  flight: ScoredFlightOffer
): "High" | "Medium" | "Low" {
  // Data completeness check
  const hasAmenityData =
    flight.amenities.baggageIncluded ||
    flight.amenities.wifi ||
    flight.amenities.seatPitchInches !== null;

  if (batchSize >= 4 && hasAmenityData) return "High";
  if (batchSize >= 2) return "Medium";
  return "Low";
}

/* ─── Prediction Stub (ML-ready) ─────────────────────────────────── */

function buildPrediction(
  flight: ScoredFlightOffer,
  totalScore: number
): PricePrediction {
  const departureDate = new Date(flight.departureDate);
  const now = new Date();
  const daysUntilDeparture = Math.max(
    0,
    Math.round(
      (departureDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    )
  );

  // Heuristic-based stub — replace with trained model later
  let trend: string;
  let recommendation: string;

  if (daysUntilDeparture <= 7) {
    trend = "↑ Likely to increase";
    recommendation = "Buy now";
  } else if (daysUntilDeparture <= 21) {
    trend = "→ Stable";
    recommendation = totalScore >= 70 ? "Buy now" : "Consider waiting";
  } else {
    trend = "↓ May decrease";
    recommendation = totalScore >= 80 ? "Buy now" : "Wait for a better deal";
  }

  return {
    trend,
    recommendation,
    confidence: daysUntilDeparture <= 14 ? "Medium" : "Low",
    mlFeatures: {
      days_until_departure: daysUntilDeparture,
      day_of_week: departureDate.getDay(),
      current_fare: flight.price,
      total_duration_minutes: flight.totalDurationMinutes,
      stops: flight.stops,
      has_overnight_layover: flight.layovers.some((l) => l.isOvernight) ? 1 : 0,
      baggage_included: flight.amenities.baggageIncluded ? 1 : 0,
      airline_tier:
        flight.amenities.airlineTier === "premium"
          ? 2
          : flight.amenities.airlineTier === "budget"
            ? 0
            : 1,
    },
  };
}

/* ─── Carrier Tier Detection ─────────────────────────────────────── */

export function detectAirlineTier(
  carrierName: string
): "premium" | "standard" | "budget" {
  if (PREMIUM_CARRIERS.has(carrierName)) return "premium";
  if (BUDGET_CARRIERS.has(carrierName)) return "budget";
  return "standard";
}

/* ─── Main Entry Point ───────────────────────────────────────────── */

/**
 * Score, rank, and label a batch of flight offers.
 *
 * @param flights  Raw (unscored) flight offers — scoring fields can be zeroed.
 * @param maxResults  Maximum number of results to return (default 5).
 * @returns Flights sorted by totalScore descending, capped at maxResults.
 */
export function scoreAndRankFlights(
  flights: ScoredFlightOffer[],
  maxResults: number = MAX_RESULTS
): ScoredFlightOffer[] {
  if (flights.length === 0) return [];

  // 1. Price scores (relative to batch)
  computePriceScores(flights);

  // 2. Quality scores + total scores
  const avgPrice =
    flights.reduce((sum, f) => sum + f.price, 0) / flights.length;

  for (const flight of flights) {
    flight.qualityScore = computeQualityScore(flight);
    flight.totalScore = Math.round(
      PRICE_WEIGHT * flight.priceScore +
        QUALITY_WEIGHT * flight.qualityScore
    );
    flight.totalScore = Math.max(0, Math.min(100, flight.totalScore));

    // 3. Labels
    const deal = getDealInfo(flight.totalScore);
    flight.dealLabel = deal.label;
    flight.dealEmoji = deal.emoji;

    // 4. Price vs average
    flight.priceVsAverage = computePriceVsAverage(flight.price, avgPrice);

    // 5. Confidence
    flight.confidence = computeConfidence(flights.length, flight);

    // 6. Prediction
    flight.prediction = buildPrediction(flight, flight.totalScore);
  }

  // Sort by totalScore descending
  flights.sort((a, b) => b.totalScore - a.totalScore);

  return flights.slice(0, maxResults);
}
