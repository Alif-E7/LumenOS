interface StatusBadgeProps {
  label: string;
  variant?: "success" | "warning" | "danger" | "info" | "neutral";
}

const variantStyles = {
  success: "bg-green-500/20 text-green-400 border-green-500/30",
  warning: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  danger: "bg-red-500/20 text-red-400 border-red-500/30",
  info: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  neutral: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

const variantIcons = {
  success: "✓",
  warning: "▲",
  danger: "✕",
  info: "ℹ",
  neutral: "●",
};

export function StatusBadge({ label, variant = "neutral" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${variantStyles[variant]}`}
    >
      <span aria-hidden="true" className="text-[10px] opacity-80">
        {variantIcons[variant]}
      </span>
      <span>{label}</span>
    </span>
  );
}

