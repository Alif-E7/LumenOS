import { cn } from "../lib/utils";
import { Check, AlertTriangle, X, Info, Circle } from "lucide-react";

interface StatusBadgeProps {
  label: string;
  variant?: "success" | "warning" | "danger" | "info" | "neutral";
}

const variantStyles = {
  success: "text-ok border-ok/40 bg-ok/10",
  warning: "text-warn border-warn/40 bg-warn/10",
  danger: "text-crit border-crit/40 bg-crit/10",
  info: "text-info border-info/40 bg-info/10",
  neutral: "text-muted border-edge-strong bg-raised",
};

const variantIcons = {
  success: Check,
  warning: AlertTriangle,
  danger: X,
  info: Info,
  neutral: Circle,
};

export function StatusBadge({ label, variant = "neutral" }: StatusBadgeProps) {
  const Icon = variantIcons[variant];
  return (
 <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em]",
        variantStyles[variant]
 )}
 >
 <Icon aria-hidden="true" className="h-3 w-3" strokeWidth={2.5} />
 <span>{label}</span>
 </span>
 );
}
