import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  subtitle?: string;
  icon?: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({
  title,
  subtitle,
  icon,
  children,
  className = "",
  onClick,
}: CardProps) {
  return (
    <div
      className={`rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm p-6 ${
        onClick ? "cursor-pointer hover:border-blue-500/50 transition-colors" : ""
      } ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {(title || icon) && (
        <div className="flex items-center gap-3 mb-4">
          {icon && <span className="text-2xl">{icon}</span>}
          <div>
            {title && <h3 className="text-lg font-semibold text-white">{title}</h3>}
            {subtitle && (
              <p className="text-sm text-slate-400">{subtitle}</p>
            )}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

