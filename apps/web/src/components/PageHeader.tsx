import type { ReactNode } from "react";
import { cn } from "../lib/utils";

interface PageHeaderProps {
  /** Mono kicker line above the title, e.g. "FLIGHT OPS / 02". */
  kicker?: string;
  title: string;
  /** One short sentence — anything longer doesn't belong here. */
  description?: string;
  /** Right-aligned action cluster. */
  actions?: ReactNode;
  className?: string;
}

/** Standard console page header: kicker, title, one-line description, actions. */
export function PageHeader({
  kicker,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
 <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className
 )}
 >
 <div className="min-w-0 animate-rise">
        {kicker && (
 <div className="micro-label mb-2 flex items-center gap-2 text-accent">
 <span className="inline-block h-1.5 w-1.5 bg-accent glow-accent" />
            {kicker}
 </div>
 )}
 <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">
          {title}
 </h1>
        {description && (
 <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>
 )}
 </div>
      {actions && (
 <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
 )}
 </div>
 );
}
