import { Car, MapPin, Clock } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useState } from "react";

interface RadiusSliderProps {
  value: number;
  onChange: (miles: number) => void;
}

export function RadiusSlider({ value, onChange }: RadiusSliderProps) {
  const [mode, setMode] = useState<"distance" | "time">("distance");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          {mode === "distance" ? (
            <Car className="h-4 w-4 text-primary" />
          ) : (
            <Clock className="h-4 w-4 text-primary" />
          )}
          Alternative Airport Search Radius
        </Label>
        
        <ToggleGroup 
          value={mode} 
          onValueChange={(val) => {
            if (val) setMode(val as "distance" | "time");
          }}
          className="h-8"
        >
          <ToggleGroupItem value="distance" className="h-8 px-2 text-xs">
            Distance
          </ToggleGroupItem>
          <ToggleGroupItem value="time" className="h-8 px-2 text-xs">
            Time (Est.)
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex items-center gap-4">
        <Input
          type="number"
          min={0}
          max={500}
          step={10}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-32"
        />
        <span className="text-sm text-muted-foreground">
          {mode === "distance" ? "miles" : "minutes of driving"}
        </span>
      </div>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        We'll search commercial airports within this {mode === "distance" ? "driving distance" : "driving time"} of your destination and
        compare total cost (flight + ground transit).
      </p>
    </div>
  );
}
