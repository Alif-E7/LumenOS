/**
 * Slider — range input with value display and label.
 */

import { cn } from "@/lib/utils";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
  disabled = false,
  className,
}: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between text-sm">
        <label className="text-slate-300 font-medium">{label}</label>
        <span className="text-slate-400 font-mono text-xs">
          {value}{unit && ` ${unit}`}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer
          accent-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: `linear-gradient(to right, rgb(59 130 246) ${pct}%, rgb(30 41 59) ${pct}%)`,
        }}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      />
      <div className="flex justify-between text-xs text-slate-600">
        <span>{min}{unit && ` ${unit}`}</span>
        <span>{max}{unit && ` ${unit}`}</span>
      </div>
    </div>
  );
}

