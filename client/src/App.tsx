import { Plane } from "lucide-react";
import { ResultsMatrix } from "@/components/ResultsMatrix";
import { SearchPanel } from "@/components/SearchPanel";
import { SearchProvider } from "@/context/SearchContext";

function AppContent() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50/30">
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Plane className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">FlightPrice</h1>
            <p className="text-xs text-muted-foreground">
              Smart flight optimization with alternative routing
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <SearchPanel />
        <ResultsMatrix />
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Flight data powered by SerpAPI (Google Flights) · Driving distances via OSRM
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <SearchProvider>
      <AppContent />
    </SearchProvider>
  );
}
