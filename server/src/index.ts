import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Resolve .env relative to the server package root (one level up from src/)
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", ".env") });

import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import searchRoutes from "./routes/search.js";

// Startup diagnostics — surface missing keys immediately
if (!process.env.SERPAPI_API_KEY) {
  console.warn(
    "⚠️  SERPAPI_API_KEY is not set. Copy server/.env.example to server/.env and add your key."
  );
}

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

// ── Security Headers (CRIT-3) ──
app.use(helmet());

// ── CORS — locked to frontend origin (CRIT-4) ──
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    methods: ["GET", "POST"],
  })
);

// ── JSON body size limit (CRIT-5) ──
app.use(express.json({ limit: "100kb" }));

// ── Global rate limit: 100 requests per minute per IP (CRIT-2) ──
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again shortly." },
  })
);

// ── Search-specific rate limit: 5 searches per minute per IP ──
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Search rate limit exceeded. Please wait before searching again.",
  },
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/search", searchLimiter);
app.use("/api", searchRoutes);

app.listen(PORT, () => {
  console.log(`FlightPrice API server running on http://localhost:${PORT}`);
});
