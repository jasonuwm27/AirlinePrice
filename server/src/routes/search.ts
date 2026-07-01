import { Router, type Request, type Response } from "express";
import { searchLocations } from "../services/airports.js";
import {
  estimateSearch,
  executeSearch,
  getNearbyAirportsPreview,
} from "../services/optimization.js";
import {
  searchFlightsMultiAirport,
  NoAirportsFoundError,
  AirportNotFoundError,
} from "../services/searchFlights.js";
import type { FilterType, SearchCriteria } from "../types/index.js";

const router = Router();

function todayIsoDate(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function validateTravelWindow(
  startDate: string,
  endDate: string
): string | null {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    return "Dates must be in YYYY-MM-DD format.";
  }
  if (startDate > endDate) {
    return "Travel window start date must be on or before the end date.";
  }
  if (endDate < todayIsoDate()) {
    return "Please choose current or future travel dates.";
  }
  return null;
}

router.post("/search", async (req: Request, res: Response) => {
  try {
    const criteria = req.body as SearchCriteria;

    if (!criteria.origin || !criteria.destination) {
      res.status(400).json({ error: "Origin and destination are required." });
      return;
    }

    if (!criteria.dateRangeStart || !criteria.dateRangeEnd) {
      res.status(400).json({ error: "Date range is required." });
      return;
    }

    const dateError = validateTravelWindow(
      criteria.dateRangeStart,
      criteria.dateRangeEnd
    );
    if (dateError) {
      res.status(400).json({ error: dateError });
      return;
    }

    const result = await executeSearch({
      ...criteria,
      origin: criteria.origin.toUpperCase(),
      destination: criteria.destination.toUpperCase(),
      radiusMiles: criteria.radiusMiles ?? 100,
      passengers: criteria.passengers ?? 1,
      tripDurationMin: criteria.tripDurationMin ?? 7,
      tripDurationMax: criteria.tripDurationMax ?? 10,
      returnTrip: criteria.returnTrip ?? true,
    });

    res.json(result);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
});

router.post("/search/estimate", async (req: Request, res: Response) => {
  try {
    const criteria = req.body as SearchCriteria;

    if (!criteria.destination) {
      res.status(400).json({ error: "Destination is required." });
      return;
    }

    if (!criteria.dateRangeStart || !criteria.dateRangeEnd) {
      res.status(400).json({ error: "Date range is required." });
      return;
    }

    const dateError = validateTravelWindow(
      criteria.dateRangeStart,
      criteria.dateRangeEnd
    );
    if (dateError) {
      res.status(400).json({ error: dateError });
      return;
    }

    const result = await estimateSearch({
      ...criteria,
      origin: criteria.origin?.toUpperCase() ?? "",
      destination: criteria.destination.toUpperCase(),
      radiusMiles: criteria.radiusMiles ?? 100,
      passengers: criteria.passengers ?? 1,
      tripDurationMin: criteria.tripDurationMin ?? 7,
      tripDurationMax: criteria.tripDurationMax ?? 10,
      returnTrip: criteria.returnTrip ?? true,
    });

    res.json(result);
  } catch (err) {
    console.error("Search estimate error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Estimate failed",
    });
  }
});

router.get("/locations", (req: Request, res: Response) => {
  try {
    const keyword = String(req.query.keyword ?? "");
    if (keyword.length < 2) {
      res.json({ suggestions: [] });
      return;
    }

    const suggestions = searchLocations(keyword);
    res.json({ suggestions });
  } catch (err) {
    console.error("Location search error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Location search failed",
    });
  }
});

router.get("/airports/nearby", async (req: Request, res: Response) => {
  try {
    const destination = String(req.query.destination ?? "");
    const radius = parseInt(String(req.query.radius ?? "100"), 10);

    if (!destination) {
      res.status(400).json({ error: "Destination is required." });
      return;
    }

    const result = await getNearbyAirportsPreview(destination, radius);
    res.json(result);
  } catch (err) {
    console.error("Nearby airports error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to find nearby airports",
    });
  }
});

/**
 * GET /api/search-flights
 *
 * Multi-airport flight search: resolves a city/airport name query to
 * coordinates, finds nearby airports within a distance or driving-time
 * threshold, queries SerpAPI with a comma-separated arrival_id, and
 * returns aggregated offers with per-airport distances, driving hours,
 * and price insights.
 *
 * Query params:
 *   - departure_id      (required)  IATA code of departure airport
 *   - destination_query  (required)  City name, airport name, or IATA code (e.g. "Chicago", "O'Hare", "ORD")
 *   - departure_date     (required)  Outbound date in YYYY-MM-DD
 *   - return_date        (optional)  Return date in YYYY-MM-DD
 *   - filter_type        (optional)  "miles" or "hours" (default: "miles")
 *   - max_threshold      (optional)  Numeric threshold for the chosen filter (default: 150)
 */
router.get("/search-flights", async (req: Request, res: Response) => {
  try {
    // --- Extract and trim query params ---
    const departureId = String(req.query.departure_id ?? "").trim();
    const destinationQuery = String(req.query.destination_query ?? "").trim();
    const departureDate = String(req.query.departure_date ?? "").trim();
    const returnDate = req.query.return_date
      ? String(req.query.return_date).trim()
      : undefined;
    const filterTypeRaw = String(req.query.filter_type ?? "miles").trim().toLowerCase();
    const maxThresholdRaw = String(req.query.max_threshold ?? "150").trim();

    // --- Validate required params ---
    const missing: string[] = [];
    if (!departureId) missing.push("departure_id");
    if (!destinationQuery) missing.push("destination_query");
    if (!departureDate) missing.push("departure_date");

    if (missing.length > 0) {
      res.status(400).json({
        error: `Missing required query parameters: ${missing.join(", ")}`,
      });
      return;
    }

    // --- Validate filter_type ---
    if (filterTypeRaw !== "miles" && filterTypeRaw !== "hours") {
      res.status(400).json({
        error: `Invalid filter_type "${filterTypeRaw}". Must be "miles" or "hours".`,
      });
      return;
    }
    const filterType: FilterType = filterTypeRaw;

    // --- Validate max_threshold ---
    const maxThreshold = parseFloat(maxThresholdRaw);
    if (Number.isNaN(maxThreshold) || maxThreshold <= 0) {
      res.status(400).json({
        error: `Invalid max_threshold "${maxThresholdRaw}". Must be a positive number.`,
      });
      return;
    }

    // --- Validate date format (YYYY-MM-DD) ---
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(departureDate)) {
      res.status(400).json({
        error: "departure_date must be in YYYY-MM-DD format.",
      });
      return;
    }
    if (returnDate && !dateRegex.test(returnDate)) {
      res.status(400).json({
        error: "return_date must be in YYYY-MM-DD format.",
      });
      return;
    }
    if (departureDate < todayIsoDate()) {
      res.status(400).json({
        error: "departure_date must be today or a future date.",
      });
      return;
    }
    if (returnDate && returnDate < departureDate) {
      res.status(400).json({
        error: "return_date must be on or after departure_date.",
      });
      return;
    }

    // --- Execute search ---
    const result = await searchFlightsMultiAirport({
      departureId,
      destinationQuery,
      departureDate,
      returnDate,
      filterType,
      maxThreshold,
    });

    res.json(result);
  } catch (err) {
    console.error("search-flights error:", err);

    if (err instanceof AirportNotFoundError) {
      res.status(404).json({
        error: err.message,
        hint: 'Add a new airport entry to server/src/data/airports.json using this format:',
        format: { iata: "XYZ", name: "Name", city: "City", country: "Country", lat: 0.0, lon: 0.0 },
      });
      return;
    }

    if (err instanceof NoAirportsFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }

    res.status(500).json({
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
});

export default router;
