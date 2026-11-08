import type { ReactNode } from "react";
import { cn } from "../lib/utils";

interface CardProps {
  title?: string;
  subtitle?: string;
  /** Lucide icon (or any node) rendered beside the title. */
  icon?: ReactNode;
  /** Adds amber corner brackets for primary panels. */
  frame?: boolean;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({
  title,
  subtitle,
  icon,
  frame = false,
  children,
  className,
  onClick,
}: CardProps) {
  const interactive = Boolean(onClick);
  return (
    <div
      className={cn(
        "relative border border-edge bg-panel",
        frame && "tactical-frame",
        interactive &&
          "cursor-pointer transition-colors hover:border-accent-dim focus-visible:border-accent focus-visible:outline-none",
        className
      )}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      {(title || icon) && (
        <div className="flex items-center gap-3 border-b border-edge px-5 py-3.5">
          {icon && (
            <span aria-hidden="true" className="text-accent">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            {title && (
              <h3 className="micro-label text-muted !text-[11px] leading-none">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
            )}
          </div>
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}
