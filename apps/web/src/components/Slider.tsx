/**
 * Slider — range input with value display and label.
 */

import { cn } from "../lib/utils";

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
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between">
        <label className="micro-label text-faint">{label}</label>
        <span className="data-readout text-xs text-accent">
          {value}
          {unit && ` ${unit}`}
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
        className="h-1.5 w-full cursor-pointer appearance-none disabled:cursor-not-allowed disabled:opacity-40
          [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(255,176,0,0.5)]
          [&::-webkit-slider-thumb]:transition-colors [&::-webkit-slider-thumb]:hover:bg-accent-hi
          [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-2 [&::-moz-range-thumb]:rounded-none
          [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-accent"
        style={{
          background: `linear-gradient(to right, var(--color-accent) ${pct}%, var(--color-edge) ${pct}%)`,
        }}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      />
      <div className="flex justify-between font-mono text-[10px] text-faint">
        <span>
          {min}
          {unit && ` ${unit}`}
        </span>
        <span>
          {max}
          {unit && ` ${unit}`}
        </span>
      </div>
    </div>
  );
}
