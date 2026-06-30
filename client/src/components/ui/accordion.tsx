import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────────────────────────────
 * Accordion — pure Tailwind/React accordion matching shadcn/ui styles.
 * ──────────────────────────────────────────────────────────────────── */

const AccordionContext = React.createContext<{
  openValue: string | null;
  toggle: (value: string) => void;
}>({ openValue: null, toggle: () => {} });

const AccordionItemContext = React.createContext<{ value: string }>({
  value: "",
});

export function Accordion({
  children,
  className,
  defaultValue = null,
}: {
  children: React.ReactNode;
  className?: string;
  defaultValue?: string | null;
}) {
  const [openValue, setOpenValue] = React.useState<string | null>(defaultValue);

  const toggle = React.useCallback((value: string) => {
    setOpenValue((prev) => (prev === value ? null : value));
  }, []);

  return (
    <AccordionContext.Provider value={{ openValue, toggle }}>
      <div className={cn("space-y-1", className)}>{children}</div>
    </AccordionContext.Provider>
  );
}

export function AccordionItem({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <AccordionItemContext.Provider value={{ value }}>
      <div className={cn("border-b", className)}>{children}</div>
    </AccordionItemContext.Provider>
  );
}

export function AccordionTrigger({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { openValue, toggle } = React.useContext(AccordionContext);
  const { value } = React.useContext(AccordionItemContext);
  const isOpen = openValue === value;

  return (
    <button
      type="button"
      onClick={() => toggle(value)}
      className={cn(
        "flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline text-left w-full",
        className
      )}
    >
      {children}
      <ChevronDown
        className={cn(
          "h-4 w-4 shrink-0 transition-transform duration-200",
          isOpen ? "rotate-180" : ""
        )}
      />
    </button>
  );
}

export function AccordionContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { openValue } = React.useContext(AccordionContext);
  const { value } = React.useContext(AccordionItemContext);
  const isOpen = openValue === value;

  return (
    <div
      className={cn(
        "overflow-hidden text-sm transition-all",
        isOpen ? "animate-accordion-down" : "animate-accordion-up hidden"
      )}
    >
      <div className={cn("pb-4 pt-0", className)}>{children}</div>
    </div>
  );
}
