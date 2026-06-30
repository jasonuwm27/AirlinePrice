import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Resolve .env relative to the server package root (one level up from src/)
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", ".env") });

import cors from "cors";
import express from "express";
import searchRoutes from "./routes/search.js";

// Startup diagnostics — surface missing keys immediately
if (!process.env.SERPAPI_API_KEY) {
  console.warn(
    "⚠️  SERPAPI_API_KEY is not set. Copy server/.env.example to server/.env and add your key."
  );
}


const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", searchRoutes);

app.listen(PORT, () => {
  console.log(`FlightPrice API server running on http://localhost:${PORT}`);
});
