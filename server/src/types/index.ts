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

/* ─── Coordinates & Airports ─────────────────────────────────────── */

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface AirportRecord {
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
}

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

/* ─── Price Prediction (ML-ready stub) ───────────────────────────── */

export interface PricePrediction {
  /** e.g. "↑ Likely to increase", "↓ May decrease", "→ Stable" */
  trend: string;
  /** e.g. "Buy now", "Consider waiting" */
  recommendation: string;
  /** Confidence in the prediction */
  confidence: "High" | "Medium" | "Low";
  /**
   * Feature vector for ML model input (XGBoost / LightGBM).
   * Keys are feature names; values are numeric.
   * Extend as needed when plugging in a trained model.
   */
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
  arrivalAirportIata?: string;
  departureToken?: string;

  /* ── Scoring ── */
  totalScore: number;       // 0–100
  priceScore: number;       // 0–100
  qualityScore: number;     // 0–100
  dealLabel: DealLabel;
  dealEmoji: string;        // "🔥", "👍", "😐", "⚠️"
  priceVsAverage: string;   // e.g. "27% below average"
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

export interface SearchResponse {
  criteria: SearchCriteria;
  directRoute: RouteOption;
  alternativeRoutes: RouteOption[];
  allRoutes: RouteOption[];
  destinationCoords: Coordinates;
  nearbyAirports: AirportInfo[];
  searchedAt: string;
}

export interface LocationSuggestion {
  iataCode: string;
  name: string;
  cityName: string;
  countryName: string;
}

/* ─── SerpAPI Google Flights Response Types ───────────────────────── */

export interface SerpApiFlightSegment {
  departure_airport: { name: string; id: string; time: string };
  arrival_airport: { name: string; id: string; time: string };
  duration: number;
  airline: string;
  airline_logo?: string;
  flight_number: string;
  extensions?: string[];
}

export interface SerpApiLayover {
  duration: number;
  name: string;
  id: string;
  overnight?: boolean;
}

export interface SerpApiFlightResult {
  flights: SerpApiFlightSegment[];
  layovers?: SerpApiLayover[];
  total_duration: number;
  price: number;
  type?: string;
  extensions?: string[];
  airline_logo?: string;
  departure_token?: string;
  booking_token?: string;
}

export interface SerpApiFlightsResponse {
  search_metadata?: { status?: string; json_endpoint?: string };
  search_parameters?: { currency?: string };
  best_flights?: SerpApiFlightResult[];
  other_flights?: SerpApiFlightResult[];
  price_insights?: {
    lowest_price?: number;
    price_level?: string;
    typical_price_range?: [number, number];
    price_history?: number[][];
  };
  error?: string;
}

/* ─── Multi-Airport Search-Flights Types ─────────────────────────── */

/** Toggle between filtering by straight-line miles or estimated driving hours */
export type FilterType = "miles" | "hours";

/** Validated query parameters for GET /api/search-flights */
export interface MultiAirportSearchParams {
  departureId: string;
  destinationQuery: string;
  departureDate: string;
  returnDate?: string;
  filterType: FilterType;
  maxThreshold: number;
}

/** An airport found within the search radius, enriched with driving distance */
export interface NearbyAirportResult {
  iataCode: string;
  name: string;
  city: string;
  country: string;
  distanceMiles: number;
  estimatedDrivingHours: number;
}

/** Price insight data from SerpAPI (may be absent for some routes) */
export interface PriceInsight {
  lowestPrice: number | null;
  priceLevel: string | null;
  typicalPriceRange: [number, number] | null;
  priceHistory: number[][] | null;
}

/** A flight offer tagged with which arrival airport it corresponds to */
export interface MultiAirportFlightOffer extends ScoredFlightOffer {
  arrivalAirportIata: string;
}

/** Full response shape for GET /api/search-flights */
export interface SearchFlightsResponse {
  nearbyAirports: NearbyAirportResult[];
  flights: MultiAirportFlightOffer[];
  priceInsights: PriceInsight | null;
  searchedAt: string;
  meta: {
    departureId: string;
    destinationQuery: string;
    resolvedAirport: AirportRecord;
    filterType: FilterType;
    maxThreshold: number;
    departureDate: string;
    returnDate?: string;
    arrivalIdUsed: string;
  };
}
