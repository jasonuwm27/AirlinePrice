# FlightPrice — Real-Time Flight Tracker & Optimization Dashboard

A responsive web application that finds the cheapest flights between an origin and destination, including **alternative airport routing** — fly to a nearby airport within a user-defined driving radius and compare total cost (flight + ground transit) against the direct option.

## Features

- **Multi-month date range selector** — flexible travel windows (e.g., Sept–Nov 2026) with configurable trip duration (7–10 days)
- **Alternative destination radius control** — slider (0–200 mi) to find commercial airports near your final destination
- **Live flight pricing** — [SerpAPI Google Flights](https://serpapi.com/google-flights-api) (real Google Flights data)
- **Total cost comparison engine** — `Total = Flight Cost + (Driving Miles × $0.20/mi)`
- **Results matrix** — direct vs. alternative routes with net savings highlighted
- **Sorting** — Cheapest, Fastest, Best Value

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, Lucide React |
| State | React Context API |
| Backend | Express.js (API proxy, key security, orchestration) |
| Flights | **SerpAPI** — Google Flights engine |
| Airports | Static IATA dataset (`server/src/data/airports.json`) for geolocation & radius search |
| Driving | OpenStreetMap OSRM (free, no token) |

## File Structure

```
FlightPrice/
├── package.json
├── README.md
├── client/
│   ├── src/
│   │   ├── components/       # SearchPanel, DateRangeSelector, RadiusSlider, ResultsMatrix
│   │   ├── context/          # SearchContext
│   │   ├── lib/              # API client + utilities
│   │   └── types/
│   └── package.json
└── server/
    ├── .env.example
    ├── src/
    │   ├── index.ts
    │   ├── data/
    │   │   └── airports.json     # ~130 commercial airports (expand as needed)
    │   ├── routes/search.ts
    │   └── services/
    │       ├── serpapi.ts        # SerpAPI Google Flights integration
    │       ├── airports.ts       # Airport lookup, autocomplete, radius filtering
    │       ├── osrm.ts           # Driving distance
    │       ├── flightMapper.ts   # SerpAPI → app model
    │       └── optimization.ts   # Search orchestration + cost engine
    └── package.json
```

## Prerequisites

- **Node.js 18+** and npm
- **SerpAPI account** — [serpapi.com/dashboard](https://serpapi.com/dashboard)

## Installation

### 1. Install dependencies

```bash
cd FlightPrice
npm install
npm install --prefix client
npm install --prefix server
```

### 2. Configure SerpAPI key

```bash
copy server\.env.example server\.env
```

Edit `server/.env`:

```env
SERPAPI_API_KEY=your_api_key_here
PORT=3001
COST_PER_MILE=0.20
MAX_CONCURRENT_SEARCHES=3
API_BATCH_DELAY_MS=500
SERPAPI_DEEP_SEARCH=false
```

Get your API key from the [SerpAPI Dashboard](https://serpapi.com/dashboard).

> **Note:** Each search triggers 1 SerpAPI call per route compared (direct + up to 5 alternatives). A full search uses up to 6 API credits. Adjust `MAX_CONCURRENT_SEARCHES` and `API_BATCH_DELAY_MS` to stay within rate limits.

### 3. Run development servers

```bash
npm run dev
```

- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:3001

## Usage

1. Enter **origin** and **destination** airport codes (autocomplete from local airport database).
2. Select a **flexible date range** spanning multiple months.
3. Set **trip duration** (e.g., 7–10 days for round trips).
4. Adjust the **alternative airport radius** slider (e.g., 100 miles).
5. Click **Search & Compare Routes**.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/search` | Full flight search + optimization |
| `GET` | `/api/locations?keyword=JFK` | Airport autocomplete |
| `GET` | `/api/airports/nearby?destination=MIA&radius=100` | Preview nearby airports |

## SerpAPI Integration

Flight searches use the [Google Flights engine](https://serpapi.com/google-flights-api):

```
GET https://serpapi.com/search?engine=google_flights&api_key=...&departure_id=JFK&arrival_id=MIA&outbound_date=2026-09-15&return_date=2026-09-22&type=1&sort_by=2
```

- `type=1` — round trip (with `return_date`)
- `type=2` — one way
- `sort_by=2` — sort by price
- Set `SERPAPI_DEEP_SEARCH=true` for browser-identical results (slower, more credits)

## Adding Airports

If an airport isn't found, add it to `server/src/data/airports.json`:

```json
{"iata":"XYZ","name":"Airport Name","city":"City","country":"United States","lat":00.0000,"lon":-00.0000}
```

## Architecture

```
┌─────────────┐     /api/*      ┌──────────────────┐
│  React UI   │ ──────────────► │  Express Server  │
└─────────────┘                 └────────┬─────────┘
                                         │
                          ┌──────────────┼──────────────┐
                          ▼              ▼              ▼
                    SerpAPI         airports.json    OSRM API
                  (Google Flights)  (geolocation)   (driving)
```

## License

MIT
