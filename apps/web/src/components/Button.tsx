import type { ReactNode, ButtonHTMLAttributes } from "react";
import { cn } from "../lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

const variantStyles = {
  primary:
    "bg-accent text-void font-semibold hover:bg-accent-hi active:bg-accent-dim shadow-[0_0_16px_rgba(255,176,0,0.18)]",
  secondary:
    "bg-raised text-ink border border-edge-strong hover:border-accent hover:text-accent",
  danger:
    "bg-crit/15 text-crit border border-crit/40 hover:bg-crit/25",
  ghost:
    "text-muted hover:text-ink hover:bg-raised border border-transparent",
};

const sizeStyles = {
  sm: "px-3 py-1.5 text-[11px] tracking-[0.08em]",
  md: "px-4 py-2 text-xs tracking-[0.08em]",
  lg: "px-6 py-3 text-sm tracking-[0.1em]",
};

export function Button({
  variant = "primary",
  size = "md",
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 font-mono uppercase transition-all duration-150",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
        "disabled:opacity-40 disabled:pointer-events-none",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
