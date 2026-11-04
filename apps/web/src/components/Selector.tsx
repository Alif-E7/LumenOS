import { cn } from "../lib/utils";

export interface SelectorOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectorProps {
  label: string;
  value: string;
  options: SelectorOption[];
  onChange: (value: string) => void;
  /** One-line hint shown under the control. */
  hint?: string;
  disabled?: boolean;
  className?: string;
}

/** Labeled single-select (styled <select>) for payload types, modes, etc. */
export function Selector({ label, value, options, onChange, hint, disabled = false, className }: SelectorProps) {
  return (
    <div className={className}>
      <label className="block text-sm text-slate-300 font-medium mb-1" htmlFor={`selector-${label}`}>
        {label}
      </label>
      <select
        id={`selector-${label}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
