import * as React from "react";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────────────────────────────
 * ToggleGroup — a segmented-control / pill-toggle built with pure
 * Tailwind CSS.  Compatible with shadcn/ui design tokens.
 * ──────────────────────────────────────────────────────────────────── */

interface ToggleGroupProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

interface ToggleGroupItemProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

const ToggleGroupContext = React.createContext<{
  value: string;
  onValueChange: (value: string) => void;
}>({ value: "", onValueChange: () => {} });

export function ToggleGroup({
  value,
  onValueChange,
  children,
  className,
}: ToggleGroupProps) {
  return (
    <ToggleGroupContext.Provider value={{ value, onValueChange }}>
      <div
        className={cn(
          "inline-flex items-center rounded-lg border bg-muted p-0.5",
          className
        )}
        role="radiogroup"
      >
        {children}
      </div>
    </ToggleGroupContext.Provider>
  );
}

export function ToggleGroupItem({
  value,
  children,
  className,
}: ToggleGroupItemProps) {
  const ctx = React.useContext(ToggleGroupContext);
  const isActive = ctx.value === value;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isActive}
      onClick={() => ctx.onValueChange(value)}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isActive
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}
