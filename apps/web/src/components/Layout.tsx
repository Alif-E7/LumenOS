import { Outlet, NavLink } from "react-router-dom";
import { useState } from "react";
import { Menu, X, Radio, Rocket, Sliders } from "lucide-react";
import { loadMissionSession, loadDefaultExperience, saveDefaultExperience } from "../lib/mission";
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
        strokeOpacity="0.45"
        strokeWidth="1.2"
      />
      <circle cx="16" cy="16" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="16" cy="16" r="1.2" fill="currentColor" />
      <g transform="rotate(-24 16 16) translate(12.5 16)">
        <rect x="-2.6" y="-1.5" width="5.2" height="3" fill="currentColor" />
        <rect x="-4.8" y="-0.9" width="1.8" height="1.8" fill="currentColor" fillOpacity="0.7" />
        <rect x="3" y="-0.9" width="1.8" height="1.8" fill="currentColor" fillOpacity="0.7" />
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
      { to: "/hangar", label: "Hangar" },
      { to: "/design", label: "Designer" },
      { to: "/operate", label: "Control" },
    ],
  },
  {
    label: "Fleet",
    links: [
      { to: "/globe", label: "3D Earth" },
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

const SIMPLE_LINKS: { to: string; label: string; end?: boolean }[] = [
  { to: "/", label: "Home", end: true },
  { to: "/globe", label: "🌍 3D Earth" },
  { to: "/missions", label: "Missions" },
  { to: "/hangar", label: "🛠️ Hangar" },
  { to: "/play", label: "🚀 Fly!" },
  { to: "/rewards", label: "Rewards" },
  { to: "/help", label: "Academy" },
];

export function Layout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expertMode, setExpertMode] = useState(() => loadDefaultExperience() === "expert");
  const session = loadMissionSession();
  const inFlight = Boolean(session?.sessionId);
  const flightPath = expertMode || session?.mode === "coop" ? "/operate" : "/play";

  const toggleExperience = () => {
    const next = !expertMode;
    setExpertMode(next);
    saveDefaultExperience(next ? "expert" : "simple");
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "whitespace-nowrap rounded-lg px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] transition-all",
      isActive
        ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 shadow-sm"
        : "text-slate-300 hover:text-white hover:bg-slate-800/70"
    );

  const navLinks = expertMode
    ? NAV_GROUPS
    : [{ label: "Command", links: SIMPLE_LINKS }];

  return (
    <div className="flex min-h-screen flex-col bg-void text-ink">
      {/* Aerospace Glassmorphic Command Header */}
      <header className="sticky top-0 z-50 border-b border-slate-800/90 bg-[#030711]/90 backdrop-blur-xl shadow-lg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between gap-4">
            {/* Brand Identity */}
            <NavLink to="/" className="flex shrink-0 items-center gap-2.5 text-cyan-400">
              <LogoMark className="h-7 w-7" />
              <span className="leading-none">
                <span className="block font-mono text-sm font-bold tracking-[0.22em] text-slate-100">
                  LUMENOS
                </span>
                <span className="mt-1 block font-mono text-[9px] tracking-[0.26em] text-cyan-400">
                  {expertMode ? "FLIGHT CONSOLE" : "ORBITAL AI COMMAND"}
                </span>
              </span>
            </NavLink>

            {/* Desktop Navigation */}
            <nav className="hidden items-center gap-3 lg:flex" aria-label="Primary">
              {navLinks.map((group) => (
                <div key={group.label} className="flex items-center gap-1">
                  <span className="micro-label mr-1 hidden text-slate-500 xl:inline">
                    {group.label}
                  </span>
                  {group.links.map((link) => (
                    <NavLink key={link.to} to={link.to} end={link.end} className={linkClass}>
                      {link.label}
                    </NavLink>
                  ))}
                </div>
              ))}
              {!expertMode ? (
                <button
                  type="button"
                  onClick={toggleExperience}
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-slate-400 transition-colors hover:text-cyan-300 hover:border-cyan-500/40 cursor-pointer"
                  title="Switch to the full 4-station Systems Engineering Console"
                >
                  <Sliders className="h-3 w-3" aria-hidden /> Expert Mode
                </button>
              ) : (
                <button
                  type="button"
                  onClick={toggleExperience}
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-cyan-300 transition-colors hover:bg-cyan-500/20 cursor-pointer"
                  title="Switch to the streamlined 3D Flight Deck"
                >
                  <Rocket className="h-3 w-3" aria-hidden /> 3D Flight Mode
                </button>
              )}
            </nav>

            {/* Live Active Sortie Pill + Mobile Menu Toggle */}
            <div className="flex items-center gap-3">
              {inFlight && (
                <NavLink
                  to={flightPath}
                  className="hidden items-center gap-2 rounded-xl border border-amber-400/50 bg-amber-500/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-amber-300 transition-colors hover:bg-amber-500/20 sm:inline-flex"
                  title={`Active Sortie — ${session?.missionName ?? ""}`}
                >
                  <Radio className="h-3 w-3 animate-pulse text-amber-400" aria-hidden />
                  <span className="max-w-32 truncate">{session?.missionName ?? "In Flight"}</span>
                </NavLink>
              )}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="rounded-lg border border-slate-700 p-1.5 text-slate-300 transition-colors hover:text-white lg:hidden"
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

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div
            className="border-t border-slate-800 bg-[#030711] p-4 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          >
            {navLinks.map((group) => (
              <div key={group.label} className="mb-3 last:mb-0">
                <div className="micro-label mb-1.5 text-cyan-400">{group.label}</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {group.links.map((link) => (
                    <NavLink key={link.to} to={link.to} end={link.end} className={linkClass}>
                      {link.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
            {inFlight && (
              <NavLink
                to={flightPath}
                className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-amber-300"
              >
                <Radio className="h-3 w-3 animate-pulse" aria-hidden />
                Resume: {session?.missionName ?? "Mission"}
              </NavLink>
            )}
            <button
              type="button"
              onClick={toggleExperience}
              className="mt-3 w-full rounded-xl border border-slate-800 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-slate-300"
            >
              {expertMode ? "Switch to 3D Flight Mode" : "Switch to Expert Mode"}
            </button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Aerospace Footer */}
      <footer className="border-t border-slate-800/80 bg-[#030711] py-4">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 font-mono text-[10px] tracking-[0.14em] text-slate-400 sm:flex-row sm:px-6 lg:px-8">
          <span>LUMENOS v2.4 · ORBITAL AI DATA CENTER & EARTH OBSERVATION SIMULATOR</span>
          <span className="flex gap-5">
            <NavLink to="/sources" className="hover:text-cyan-300 transition-colors">
              DATA PROVENANCE
            </NavLink>
            <NavLink to="/help" className="hover:text-cyan-300 transition-colors">
              ACADEMY
            </NavLink>
            <NavLink to="/settings" className="hover:text-cyan-300 transition-colors">
              SETTINGS
            </NavLink>
          </span>
        </div>
      </footer>
    </div>
  );
}
