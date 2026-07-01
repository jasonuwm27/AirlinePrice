import { Skeleton } from "@/components/ui/skeleton";
import { useSearch } from "@/context/SearchContext";
import { Loader2 } from "lucide-react";

export function ResultsSkeleton() {
  const { searchProgress } = useSearch();

  if (searchProgress) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-24 animate-fade-in">
        <Loader2 className="h-10 w-10 animate-spin text-primary/80" />
        <h3 className="text-xl font-medium tracking-tight">Scanning Matrix</h3>
        <p className="text-muted-foreground animate-pulse">{searchProgress}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-64" />
      </div>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-8 w-24" />
          </div>
          <div className="grid grid-cols-4 gap-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
