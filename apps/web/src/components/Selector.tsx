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
      <label className="micro-label mb-1.5 block text-faint" htmlFor={`selector-${label}`}>
        {label}
      </label>
      <select
        id={`selector-${label}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          "w-full border border-edge-strong bg-raised px-3 py-2 text-sm text-ink",
          "transition-colors hover:border-edge-strong/80 focus:border-accent focus:outline-none",
          "disabled:opacity-40 disabled:pointer-events-none"
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      {hint && <p className="mt-1.5 text-xs text-faint">{hint}</p>}
    </div>
  );
}
