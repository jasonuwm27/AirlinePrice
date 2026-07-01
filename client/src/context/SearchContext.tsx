import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { searchFlights } from "@/lib/api";
import { compareIsoDates, todayIsoDate } from "@/lib/utils";
import type { RouteOption, SearchCriteria, SearchResponse, SortOption } from "@/types";
import { DEFAULT_CRITERIA } from "@/types";

interface SearchContextValue {
  criteria: SearchCriteria;
  setCriteria: (partial: Partial<SearchCriteria>) => void;
  results: SearchResponse | null;
  sortedRoutes: RouteOption[];
  isLoading: boolean;
  error: string | null;
  sortBy: SortOption;
  setSortBy: (sort: SortOption) => void;
  searchProgress: string | null;
  executeSearch: () => Promise<void>;
}

const SearchContext = createContext<SearchContextValue | null>(null);

function sortRoutes(routes: RouteOption[], sortBy: SortOption): RouteOption[] {
  const copy = [...routes];
  switch (sortBy) {
    case "cheapest":
      return copy.sort((a, b) => a.totalCost - b.totalCost);
    case "fastest":
      return copy.sort((a, b) => a.totalDurationMinutes - b.totalDurationMinutes);
    case "best_value": {
      // Sort by the highest totalScore of the first flight in each route
      return copy.sort((a, b) => {
        const scoreA = a.topFlights[0]?.totalScore ?? 0;
        const scoreB = b.topFlights[0]?.totalScore ?? 0;
        return scoreB - scoreA; // descending
      });
    }
    default:
      return copy;
  }
}

export function SearchProvider({ children }: { children: ReactNode }) {
  const [criteria, setCriteriaState] = useState<SearchCriteria>(DEFAULT_CRITERIA);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("cheapest");
  const [searchProgress, setSearchProgress] = useState<string | null>(null);

  const setCriteria = useCallback((partial: Partial<SearchCriteria>) => {
    setCriteriaState((prev) => ({ ...prev, ...partial }));
  }, []);

  const executeSearch = useCallback(async () => {
    if (!criteria.origin || !criteria.destination) {
      setError("Please enter both origin and destination.");
      return;
    }
    if (!criteria.dateRangeStart || !criteria.dateRangeEnd) {
      setError("Please select a date range.");
      return;
    }
    const today = todayIsoDate();
    if (compareIsoDates(criteria.dateRangeEnd, today) < 0) {
      setError("Please choose current or future travel dates.");
      return;
    }
    if (compareIsoDates(criteria.dateRangeStart, criteria.dateRangeEnd) > 0) {
      setError("The travel window start date must be on or before the end date.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSearchProgress("Initializing search...");

    try {
      const response = await searchFlights(criteria, (msg) => {
        setSearchProgress(msg);
      });
      setResults(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed. Please try again.");
      setResults(null);
    } finally {
      setIsLoading(false);
      setSearchProgress(null);
    }
  }, [criteria]);

  const sortedRoutes = useMemo(() => {
    if (!results) return [];
    return sortRoutes(results.allRoutes.filter((r) => r.topFlights.length > 0 || r.error), sortBy);
  }, [results, sortBy]);

  const value = useMemo(
    () => ({
      criteria,
      setCriteria,
      results,
      sortedRoutes,
      isLoading,
      error,
      sortBy,
      setSortBy,
      searchProgress,
      executeSearch,
    }),
    [criteria, setCriteria, results, sortedRoutes, isLoading, error, sortBy, searchProgress, executeSearch]
  );

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearch must be used within SearchProvider");
  return ctx;
}
