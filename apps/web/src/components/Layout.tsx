import { Outlet, NavLink } from "react-router-dom";
import { useState } from "react";
import { Menu, X, Radio } from "lucide-react";
import { loadMissionSession } from "../lib/mission";
import { cn } from "../lib/utils";

/** Orbital mark — satellite on an inclined orbit around a ground node. */
function LogoMark({ className }: { className?: string }) {
  return (
 <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
 <ellipse
        cx="16"
        cy="16"
        rx="12.5"
        ry="7.5"
        transform="rotate(-24 16 16)"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1"
      />
 <circle cx="16" cy="16" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
 <circle cx="16" cy="16" r="1" fill="currentColor" />
 <g transform="rotate(-24 16 16) translate(12.5 16)">
 <rect x="-2.6" y="-1.5" width="5.2" height="3" fill="currentColor" />
 <rect x="-4.6" y="-0.8" width="1.6" height="1.6" fill="currentColor" fillOpacity="0.6" />
 <rect x="3" y="-0.8" width="1.6" height="1.6" fill="currentColor" fillOpacity="0.6" />
 </g>
 </svg>
 );
}

const NAV_GROUPS: { label: string; links: { to: string; label: string; end?: boolean }[] }[] = [
  {
    label: "Mission",
    links: [
      { to: "/", label: "Home", end: true },
      { to: "/missions", label: "Missions" },
      { to: "/design", label: "Designer" },
      { to: "/operate", label: "Control" },
    ],
  },
  {
    label: "Fleet",
    links: [
      { to: "/coop", label: "Co-op" },
      { to: "/rewards", label: "Rewards" },
      { to: "/benchmark", label: "Benchmark" },
    ],
  },
  {
    label: "System",
    links: [
      { to: "/sources", label: "Sources" },
      { to: "/help", label: "Academy" },
      { to: "/settings", label: "Settings" },
    ],
  },
];

export function Layout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const session = loadMissionSession();
  const inFlight = Boolean(session?.sessionId);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "whitespace-nowrap px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors",
      isActive
        ? "bg-accent/10 text-accent"
        : "text-muted hover:text-ink hover:bg-raised"
 );

  return (
 <div className="flex min-h-screen flex-col bg-void text-ink">
      {/* Command bar */}
 <header className="sticky top-0 z-50 border-b border-edge bg-void/90 backdrop-blur-md">
 <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
 <div className="flex h-14 items-center justify-between gap-6">
            {/* Identity */}
 <NavLink to="/" className="flex shrink-0 items-center gap-2.5 text-accent">
 <LogoMark className="h-7 w-7" />
 <span className="leading-none">
 <span className="block font-mono text-sm font-bold tracking-[0.22em] text-ink">
                  LUMENOS
 </span>
 <span className="mt-1 block font-mono text-[9px] tracking-[0.3em] text-accent">
                  FLIGHT CONSOLE
 </span>
 </span>
 </NavLink>

            {/* Desktop nav */}
 <nav className="hidden items-center gap-5 lg:flex" aria-label="Primary">
              {NAV_GROUPS.map((group) => (
 <div key={group.label} className="flex items-center gap-1">
 <span className="micro-label mr-1 hidden text-faint xl:inline">
                    {group.label}
 </span>
                  {group.links.map((link) => (
 <NavLink key={link.to} to={link.to} end={link.end} className={linkClass}>
                      {link.label}
 </NavLink>
 ))}
 </div>
 ))}
 </nav>

            {/* Live status + mobile toggle */}
 <div className="flex items-center gap-3">
              {inFlight && (
 <NavLink
                  to="/operate"
                  className="hidden items-center gap-2 border border-accent/40 bg-accent/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-accent transition-colors hover:bg-accent/20 sm:inline-flex"
                  title={`Mission in flight — ${session?.missionName ?? ""}`}
 >
 <Radio className="h-3 w-3 animate-pulse-soft" aria-hidden />
 <span className="max-w-28 truncate">{session?.missionName ?? "In Flight"}</span>
 </NavLink>
 )}
 <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="border border-edge-strong p-1.5 text-muted transition-colors hover:text-ink lg:hidden"
                aria-label="Toggle navigation menu"
                aria-expanded={mobileMenuOpen}
 >
                {mobileMenuOpen ? (
 <X className="h-4 w-4" aria-hidden />
 ) : (
 <Menu className="h-4 w-4" aria-hidden />
 )}
 </button>
 </div>
 </div>
 </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
 <div className="border-t border-edge bg-void p-4 lg:hidden" onClick={() => setMobileMenuOpen(false)}>
            {NAV_GROUPS.map((group) => (
 <div key={group.label} className="mb-3 last:mb-0">
 <div className="micro-label mb-1.5 text-accent">{group.label}</div>
 <div className="grid grid-cols-3 gap-1">
                  {group.links.map((link) => (
 <NavLink key={link.to} to={link.to} end={link.end} className={linkClass}>
                      {link.label}
 </NavLink>
 ))}
 </div>
 </div>
 ))}
 </div>
 )}
 </header>

      {/* Main content */}
 <main className="flex-1">
 <Outlet />
 </main>

      {/* Baseline */}
 <footer className="border-t border-edge py-4">
 <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 font-mono text-[10px] tracking-[0.12em] text-faint sm:flex-row sm:px-6 lg:px-8">
 <span>LUMENOS v0.1.0 · SIMULATED TELEMETRY</span>
 <span className="flex gap-4">
 <NavLink to="/sources" className="hover:text-muted">DATA</NavLink>
 <NavLink to="/help" className="hover:text-muted">ACADEMY</NavLink>
 <NavLink to="/settings" className="hover:text-muted">SETTINGS</NavLink>
 </span>
 </div>
 </footer>
 </div>
 );
}
