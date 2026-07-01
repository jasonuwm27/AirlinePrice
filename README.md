# FlightPrice

FlightPrice is a flight deal and route optimization app for flexible round-trip travel. It compares direct flights against nearby alternative arrival airports, then factors in the driving time and cost from the alternative airport to the final destination.

The app is designed to keep SerpAPI usage visible and controlled while still searching useful flexible-date combinations.

## Features

- Flexible round-trip travel window with separate start and end date buttons
- Current/future date enforcement on the frontend and backend
- Trip duration range, for example 5-10 days
- Alternative airport radius search
- Direct route vs. fly-and-drive route comparison
- SerpAPI Google Flights native round-trip queries
- Max-IATA multi-airport searches, capped at 4 origin and 4 destination airports per query
- Smart, Expanded, and Full search coverage modes
- Live SerpAPI credit estimate before search
- Accordion result cards with outbound and return itinerary details
- Deal scoring, price-vs-average labels, confidence, and prediction placeholders
- Load-more pagination for result cards
- In-memory global SerpAPI cache with 12-hour TTL

## Search Coverage Modes

### Smart

Smart mode uses an Anchor and Drill-Down algorithm:

1. Sparse anchor scan across the travel window.
2. Uses every 4th departure day.
3. Uses the median trip duration.
4. Finds the cheapest anchor departure date.
5. Runs a dense local scan 2 days before and after that anchor.
6. Uses the full trip-duration range for the dense scan.

This keeps request count low while still looking for price valleys.

### Expanded

Expanded mode uses a sparse grid:

1. Generates all mathematically valid departure/return date pairs.
2. Samples every 2nd departure date.
3. Uses only min, median, and max trip durations.
4. Hard-caps sampled combinations at 40 date-pair calls.
5. Spreads the sample across the calendar window.

### Full

Full mode searches every valid round-trip date pair in the selected window. It is the most complete mode and can use many more API credits.

## API Credit Strategy

The backend avoids the old brute-force explosion by:

- Sending comma-separated origin and destination IATA lists to SerpAPI
- Querying native round trips only
- Avoiding split-and-stitch one-way pricing
- Caching SerpAPI responses globally for 12 hours
- Estimating request count before search
- Hydrating detailed return itineraries only for top grouped results

Cache keys are user-independent:

```text
FLIGHTS_${departureString}_${arrivalString}_${outboundDate}_${returnDate}
FLIGHT_DETAILS_${departureString}_${arrivalString}_${outboundDate}_${returnDate}_${departureToken}
```

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, shadcn-style components, Lucide React |
| State | React Context API |
| Backend | Node.js, Express, TypeScript |
| Flights | SerpAPI Google Flights engine |
| Airports | Local IATA dataset |
| Driving | OSRM / OpenStreetMap |

## Project Structure

```text
FlightPrice/
  client/
    src/
      components/
        DateRangeSelector.tsx
        FlightItinerary.tsx
        RadiusSlider.tsx
        ResultsMatrix.tsx
        SearchPanel.tsx
      context/
        SearchContext.tsx
      lib/
        api.ts
        utils.ts
      types/
        index.ts
  server/
    src/
      data/
        airports.json
      routes/
        search.ts
      services/
        airports.ts
        flightMapper.ts
        optimization.ts
        osrm.ts
        searchFlights.ts
        serpapi.ts
      utils/
        concurrency.ts
        dateMatrix.ts
        distance.ts
        flightGrouping.ts
        geo.ts
        scoring.ts
```

## Setup

Install dependencies:

```bash
npm install
npm install --prefix client
npm install --prefix server
```

Create the server environment file:

```powershell
Copy-Item server\.env.example server\.env
```

Edit `server/.env`:

```env
SERPAPI_API_KEY=your_serpapi_key_here
PORT=3001
COST_PER_MILE=0.20
MAX_CONCURRENT_SEARCHES=3
API_BATCH_DELAY_MS=500
SERPAPI_DATE_PAIR_CONCURRENT=2
SERPAPI_DETAIL_CONCURRENT=3
SERPAPI_MAX_RESULTS=25
SERPAPI_MAX_DATE_PAIRS=30
SERPAPI_EXPANDED_MAX_DATE_PAIRS=90
SERPAPI_MAX_DETAIL_HYDRATIONS=20
SERPAPI_CACHE_TTL_MS=43200000
```

Run the app:

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Backend health check |
| POST | `/api/search/estimate` | Estimate date-pair coverage and SerpAPI credits |
| POST | `/api/search` | Main optimized flight search |
| GET | `/api/locations?keyword=ORD` | Airport autocomplete |
| GET | `/api/airports/nearby?destination=MSY&radius=100` | Nearby airport preview |
| GET | `/api/search-flights` | Secondary multi-airport search endpoint |

## Search Flow

1. Resolve destination airport coordinates.
2. Find nearby airports within the selected radius.
3. Build max-IATA airport strings for SerpAPI.
4. Generate date pairs based on Smart, Expanded, or Full mode.
5. Fetch native round-trip Google Flights results.
6. Combine `best_flights` and `other_flights`.
7. Group by date, arrival airport, airline, and stop count.
8. Score grouped results.
9. Hydrate return details for top grouped results.
10. Return direct and alternative route cards to the frontend.

## Result Scoring

Flights are scored using:

- Price vs. searched average
- Total duration
- Stop count
- Overnight layovers
- Baggage indicators
- Wi-Fi indicators
- Airline tier

The response includes ML-ready placeholders:

- `trend`
- `recommendation`
- `confidence`
- `mlFeatures`

## Security Notes

- Do not commit `server/.env`.
- `server/.env.example` must contain placeholders only.
- If a real API key was ever committed, rotate it in the SerpAPI dashboard.

## Scripts

```bash
npm run dev
npm run build
npm run start
```

Client-only:

```bash
npm run build --prefix client
```

Server-only:

```bash
npm run build --prefix server
```

## License

MIT
