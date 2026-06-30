import { Car, MapPin } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

interface RadiusSliderProps {
  value: number;
  onChange: (miles: number) => void;
}

const MARKS = [0, 50, 100, 150, 200];

export function RadiusSlider({ value, onChange }: RadiusSliderProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <Car className="h-4 w-4 text-primary" />
          Alternative Airport Radius
        </Label>
        <span className="text-sm font-semibold text-primary">{value} miles</span>
      </div>

      <Slider
        min={0}
        max={200}
        step={25}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        className="py-2"
      />

      <div className="flex justify-between text-xs text-muted-foreground">
        {MARKS.map((mark) => (
          <span key={mark}>{mark} mi</span>
        ))}
      </div>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        We'll search commercial airports within this driving distance of your destination and
        compare total cost (flight + ground transit).
      </p>
    </div>
  );
}
