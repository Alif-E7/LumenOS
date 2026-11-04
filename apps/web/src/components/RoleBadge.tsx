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
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        def.bgClass,
        def.textClass,
        def.borderClass,
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
        className
      )}
    >
      <span aria-hidden>{def.icon}</span>
      {def.label}
    </span>
  );
}
