import { ROLES, type RoleId } from "../lib/constants";
import { cn } from "../lib/utils";

interface RoleBadgeProps {
  role: RoleId;
  size?: "sm" | "md";
  className?: string;
}

/** Colored role chip — distinguishes the four crew stations at a glance. */
export function RoleBadge({ role, size = "md", className }: RoleBadgeProps) {
  const def = ROLES[role];
  const { Icon } = def;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border font-mono uppercase tracking-[0.06em]",
        def.bgClass,
        def.textClass,
        def.borderClass,
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]",
        className
      )}
    >
      <Icon aria-hidden className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {def.label}
    </span>
  );
}
