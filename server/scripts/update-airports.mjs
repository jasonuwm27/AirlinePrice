import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AIRPORTS_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const COUNTRIES_URL = "https://davidmegginson.github.io/ourairports-data/countries.csv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(__dirname, "../src/data/airports.json");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(value);
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  const [headers, ...dataRows] = rows;
  return dataRows.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]))
  );
}

async function fetchCsv(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function cleanText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeAirport(row, countriesByCode) {
  const iata = cleanText(row.iata_code ?? "").toUpperCase();
  const lat = Number(row.latitude_deg);
  const lon = Number(row.longitude_deg);

  if (!/^[A-Z]{3}$/.test(iata) || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  if (row.scheduled_service !== "yes") {
    return null;
  }

  return {
    iata,
    name: cleanText(row.name),
    city: cleanText(row.municipality || row.name),
    country: countriesByCode.get(row.iso_country) ?? row.iso_country,
    lat: Math.round(lat * 1000000) / 1000000,
    lon: Math.round(lon * 1000000) / 1000000,
  };
}

function dedupeByIata(airports) {
  const byIata = new Map();

  for (const entry of airports) {
    const current = byIata.get(entry.airport.iata);
    if (!current || entry.rank > current.rank) {
      byIata.set(entry.airport.iata, entry);
    }
  }

  return [...byIata.values()]
    .sort((a, b) => {
      const countryCompare = a.airport.country.localeCompare(b.airport.country);
      if (countryCompare !== 0) return countryCompare;
      const cityCompare = a.airport.city.localeCompare(b.airport.city);
      if (cityCompare !== 0) return cityCompare;
      return a.airport.iata.localeCompare(b.airport.iata);
    })
    .map((entry) => entry.airport);
}

async function main() {
  const [airportsCsv, countriesCsv] = await Promise.all([
    fetchCsv(AIRPORTS_URL),
    fetchCsv(COUNTRIES_URL),
  ]);

  const countriesByCode = new Map(
    parseCsv(countriesCsv).map((country) => [country.code, cleanText(country.name)])
  );

  const parsedAirports = parseCsv(airportsCsv)
    .map((row) => {
      const airport = normalizeAirport(row, countriesByCode);
      if (!airport) return null;
      return {
        airport,
        rank:
          new Map([
            ["large_airport", 3],
            ["medium_airport", 2],
            ["small_airport", 1],
          ]).get(row.type) ?? 0,
      };
    })
    .filter(Boolean);

  const airports = dedupeByIata(parsedAirports);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(airports, null, 2)}\n`, "utf8");

  console.log(`Wrote ${airports.length} scheduled-service IATA airports to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
