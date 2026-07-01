export type SortOption = "cheapest" | "fastest" | "best_value";
export type DistanceDisplayMode = "distance" | "time";

/* ─── Search Criteria ────────────────────────────────────────────── */

export interface SearchCriteria {
  origin: string;
  destination: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  tripDurationMin: number;
  tripDurationMax: number;
  radiusMiles: number;
  passengers: number;
  returnTrip: boolean;
  searchDepth?: "smart" | "expanded" | "full";
}

/* ─── Airports ───────────────────────────────────────────────────── */

export interface AirportInfo {
  iataCode: string;
  name: string;
  city: string;
  distanceMiles: number;
}

/* ─── Flight Segment & Layover ───────────────────────────────────── */

export interface FlightSegment {
  departureAirport: string;
  departureAirportName: string;
  arrivalAirport: string;
  arrivalAirportName: string;
  departureTime: string;
  arrivalTime: string;
  carrier: string;
  carrierLogo?: string;
  flightNumber: string;
  durationMinutes: number;
}

export interface LayoverInfo {
  airportCode: string;
  airportName: string;
  durationMinutes: number;
  isOvernight: boolean;
}

export interface FlightLeg {
  segments: FlightSegment[];
  layovers: LayoverInfo[];
  totalDurationMinutes: number;
  stops: number;
  summary: string;
  date: string;
}

/* ─── Amenities ──────────────────────────────────────────────────── */

export type AirlineTier = "premium" | "standard" | "budget";

export interface FlightAmenities {
  baggageIncluded: boolean;
  wifi: boolean;
  seatPitchInches: number | null;
  airlineTier: AirlineTier;
}

export interface FlightTimeOption {
  id: string;
  price: number;
  currency: string;
  totalDurationMinutes: number;
  stops: number;
  outbound: FlightLeg;
  inbound?: FlightLeg;
  amenities: FlightAmenities;
  departureDate: string;
  returnDate?: string;
  outboundSummary: string;
  returnSummary?: string;
}

/* ─── Price Prediction ───────────────────────────────────────────── */

export interface PricePrediction {
  trend: string;
  recommendation: string;
  confidence: "High" | "Medium" | "Low";
  mlFeatures: Record<string, number>;
}

/* ─── Scored Flight Offer ────────────────────────────────────────── */

export type DealLabel = "Great Deal" | "Good Value" | "Fair Price" | "Expensive";

export interface ScoredFlightOffer {
  id: string;
  price: number;
  currency: string;
  totalDurationMinutes: number;
  stops: number;
  outbound: FlightLeg;
  inbound?: FlightLeg;
  segments: FlightSegment[];
  layovers: LayoverInfo[];
  amenities: FlightAmenities;
  departureDate: string;
  returnDate?: string;
  outboundSummary: string;
  returnSummary?: string;
  timeOptions: FlightTimeOption[];
  groupKey?: string;

  /* Scoring */
  totalScore: number;
  priceScore: number;
  qualityScore: number;
  dealLabel: DealLabel;
  dealEmoji: string;
  priceVsAverage: string;
  confidence: "High" | "Medium" | "Low";
  prediction: PricePrediction;
}

/* ─── Route Option ───────────────────────────────────────────────── */

export interface RouteOption {
  id: string;
  type: "direct" | "alternative";
  label: string;
  origin: string;
  flightDestination: string;
  finalDestination: string;
  topFlights: ScoredFlightOffer[];
  drivingMiles: number;
  drivingDurationMinutes: number;
  drivingCost: number;
  flightCost: number;
  totalCost: number;
  totalDurationMinutes: number;
  savingsVsDirect: number | null;
  airport?: AirportInfo;
  error?: string;
}

/* ─── Search Response ────────────────────────────────────────────── */

export interface SearchResponse {
  criteria: SearchCriteria;
  directRoute: RouteOption;
  alternativeRoutes: RouteOption[];
  allRoutes: RouteOption[];
  destinationCoords: { lat: number; lon: number };
  nearbyAirports: AirportInfo[];
  searchedAt: string;
}

export interface SearchEstimate {
  datePairCount: number;
  possibleDatePairCount: number;
  routeTargetCount: number;
  scanCredits: number;
  detailCredits: number;
  maxCredits: number;
  cappedDatePairs: boolean;
}

export interface LocationSuggestion {
  iataCode: string;
  name: string;
  cityName: string;
  countryName: string;
}

export interface SearchState {
  criteria: SearchCriteria;
  results: SearchResponse | null;
  isLoading: boolean;
  error: string | null;
  sortBy: SortOption;
}

export const DEFAULT_CRITERIA: SearchCriteria = {
  origin: "",
  destination: "",
  dateRangeStart: "",
  dateRangeEnd: "",
  tripDurationMin: 7,
  tripDurationMax: 10,
  radiusMiles: 100,
  passengers: 1,
  returnTrip: true,
  searchDepth: "smart",
};
