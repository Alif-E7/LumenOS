import { useId, useState, type ReactNode } from "react";
import { cn } from "../lib/utils";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Accessible tooltip — shows on hover and on keyboard focus.
 * Content is announced via aria-describedby.
 */
export function Tooltip({ content, children, className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
 <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
 >
 <span tabIndex={0} role="button" aria-describedby={open ? id : undefined} className="inline-flex cursor-help">
        {children}
 </span>
      {open && (
 <span
          id={id}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-xs -translate-x-1/2
            border border-edge-strong bg-raised px-3 py-2 text-xs text-ink shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
 >
          {content}
 </span>
 )}
 </span>
 );
}
