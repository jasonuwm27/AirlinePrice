import { Router, type Request, type Response } from "express";
import { z } from "zod";
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
import type { FilterType } from "../types/index.js";

const router = Router();

// ── Zod Schemas (MED-1) ──

const SearchCriteriaSchema = z.object({
  origin: z.string().min(2).max(4).regex(/^[A-Za-z]+$/, "Origin must be letters only"),
  destination: z.string().min(2).max(4).regex(/^[A-Za-z]+$/, "Destination must be letters only"),
  dateRangeStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be YYYY-MM-DD"),
  dateRangeEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be YYYY-MM-DD"),
  tripDurationMin: z.number().int().min(1).max(90).default(7),
  tripDurationMax: z.number().int().min(1).max(90).default(10),
  radiusMiles: z.number().min(0).max(500).default(100),
  passengers: z.number().int().min(1).max(9).default(1),
  returnTrip: z.boolean().default(true),
  searchDepth: z.enum(["smart", "expanded", "full"]).optional(),
});

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
    const parsed = SearchCriteriaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues.map((i) => i.message).join("; "),
      });
      return;
    }

    const criteria = parsed.data;

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
    });

    res.json(result);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
});
router.post("/search/stream", async (req: Request, res: Response) => {
  try {
    const parsed = SearchCriteriaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues.map((i) => i.message).join("; "),
      });
      return;
    }

    const criteria = parsed.data;

    const dateError = validateTravelWindow(
      criteria.dateRangeStart,
      criteria.dateRangeEnd
    );
    if (dateError) {
      res.status(400).json({ error: dateError });
      return;
    }

    // Set headers for Server-Sent Events (SSE)
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const onProgress = (message: string) => {
      res.write(`data: ${JSON.stringify({ type: "progress", message })}\n\n`);
    };

    const result = await executeSearch(
      {
        ...criteria,
        origin: criteria.origin.toUpperCase(),
        destination: criteria.destination.toUpperCase(),
      },
      onProgress
    );

    res.write(`data: ${JSON.stringify({ type: "complete", data: result })}\n\n`);
    res.end();
  } catch (err) {
    console.error("Stream search error:", err);
    // If headers already sent, we just write an error event
    if (!res.headersSent) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Internal server error",
      });
    } else {
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          error: err instanceof Error ? err.message : "Internal server error",
        })}\n\n`
      );
      res.end();
    }
  }
});

router.post("/search/estimate", async (req: Request, res: Response) => {
  try {
    // Reuse the same schema but make origin optional for estimates
    const EstimateSchema = SearchCriteriaSchema.extend({
      origin: z.string().max(4).regex(/^[A-Za-z]*$/).default(""),
    });
    const parsed = EstimateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues.map((i) => i.message).join("; "),
      });
      return;
    }

    const criteria = parsed.data;

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
      origin: criteria.origin.toUpperCase(),
      destination: criteria.destination.toUpperCase(),
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
    const keyword = String(req.query.keyword ?? "").slice(0, 50);
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
    const destination = String(req.query.destination ?? "").slice(0, 10);
    const radius = Math.min(500, Math.max(0, parseInt(String(req.query.radius ?? "100"), 10) || 100));

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
        error: `Invalid filter_type. Must be "miles" or "hours".`,
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
