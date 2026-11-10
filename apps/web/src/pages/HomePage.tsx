import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { getHealth } from "../api/client";
import { Button } from "../components/Button";
import { StatusBadge } from "../components/StatusBadge";
import { loadMissionSession } from "../lib/mission";
import { Rocket, Users, Wrench, ArrowRight, Radio } from "lucide-react";

/**
 * Kid-first landing: one hero line, one giant PLAY button, and small links
 * to everything else (friends mode, expert console, rewards).
 */
export function HomePage() {
  const navigate = useNavigate();
  const { data: health, loading, error } = useApi(getHealth);
  const session = loadMissionSession();
  const hasActiveFlight = !!(session && session.sessionId);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
      {/* Active mission banner */}
      {hasActiveFlight && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border border-accent/40 bg-accent/[0.06] px-4 py-3">
          <div className="flex items-center gap-3">
            <Radio aria-hidden className="h-4 w-4 animate-pulse-soft text-accent" />
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.1em] text-accent">
                Mission in flight — {session.missionName}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {session.mode === "solo" ? "Solo · all stations" : `Co-op · room ${session.roomCode}`}
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => navigate(session.experience === "expert" || session.mode === "coop" ? "/operate" : "/play")}>
            Resume Control <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      )}

      {/* Hero */}
      <section className="grid-bg relative mt-8 border border-edge px-6 py-14 md:px-12 text-center overflow-hidden">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-accent/40 bg-accent/10 text-[11px] font-mono uppercase tracking-widest text-accent">
          LumenOS Orbital AI Data Center & Earth-Monitoring Command
        </div>
        <h1
          aria-label="Fly your own satellite!"
          className="mt-4 text-4xl md:text-5xl font-bold text-ink leading-tight tracking-tight"
        >
          Command an Orbital AI Satellite Constellation
        </h1>
        <p className="mt-3 text-muted text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
          Deploy edge-AI spacecraft into Low Earth Orbit, manage Stefan-Boltzmann radiator rejection
          and 24-TOPS neural compute blades, and route real-time crisis telemetry across optical
          inter-satellite laser crosslinks.
        </p>

        {/* Key Architecture Highlights */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl mx-auto text-left font-mono">
          <div className="border border-edge bg-panel/70 p-3">
            <div className="text-[10px] uppercase text-faint">Edge AI Compute</div>
            <div className="text-sm font-bold text-accent-hi mt-0.5">24 TOPS Rad-Hard</div>
            <div className="text-[10px] text-muted mt-0.5">50:1 Vector Compression</div>
          </div>
          <div className="border border-edge bg-panel/70 p-3">
            <div className="text-[10px] uppercase text-faint">Optical Crosslink</div>
            <div className="text-sm font-bold text-info mt-0.5">1550 nm · 10 Gbps</div>
            <div className="text-[10px] text-muted mt-0.5">3-Node Relay Mesh</div>
          </div>
          <div className="border border-edge bg-panel/70 p-3">
            <div className="text-[10px] uppercase text-faint">Thermal Physics</div>
            <div className="text-sm font-bold text-warn mt-0.5">Stefan-Boltzmann</div>
            <div className="text-[10px] text-muted mt-0.5">Active Louver Radiators</div>
          </div>
          <div className="border border-edge bg-panel/70 p-3">
            <div className="text-[10px] uppercase text-faint">Crisis Theaters</div>
            <div className="text-sm font-bold text-ok mt-0.5">4 Global Missions</div>
            <div className="text-[10px] text-muted mt-0.5">SWIR · SAR · UV · EUV</div>
          </div>
        </div>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            aria-label="Play"
            onClick={() => navigate("/missions")}
            className="inline-flex items-center gap-3 rounded-full bg-emerald-400 px-10 py-4 text-lg font-bold text-void shadow-lg hover:bg-emerald-300 hover:scale-[1.02] transition-all cursor-pointer"
          >
            <Rocket className="h-5 w-5" aria-hidden />
            PLAY MISSION CAMPAIGN
          </button>
          <button
            type="button"
            onClick={() => navigate("/globe")}
            className="inline-flex items-center gap-2 rounded-full border border-amber-400/50 bg-amber-500/10 px-6 py-4 text-sm font-bold text-amber-200 hover:bg-amber-500/20 transition-all cursor-pointer"
          >
            🌍 Interactive 3D Earth & Constellation
          </button>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-mono">
          <button
            type="button"
            aria-label="Fly with Friends"
            onClick={() => navigate("/coop")}
            className="inline-flex items-center gap-1.5 text-muted hover:text-ink cursor-pointer"
          >
            <Users className="h-4 w-4" aria-hidden /> Co-Op Flight Deck (Fly with Friends)
          </button>
          <button
            type="button"
            onClick={() => navigate("/rewards")}
            className="inline-flex items-center gap-1.5 text-muted hover:text-ink cursor-pointer"
          >
            🏅 Career & Hardware Unlocks
          </button>
          <button
            type="button"
            onClick={() => navigate("/benchmark")}
            className="inline-flex items-center gap-1.5 text-muted hover:text-ink cursor-pointer"
          >
            📊 AI Control Benchmark
          </button>
          <button
            type="button"
            onClick={() => navigate("/design")}
            className="inline-flex items-center gap-1.5 text-muted hover:text-ink cursor-pointer"
          >
            <Wrench className="h-4 w-4" aria-hidden /> Systems Engineering Console
          </button>
        </div>

        {/* Orbit line art */}
        <svg
          aria-hidden
          viewBox="0 0 400 400"
          className="pointer-events-none absolute -right-24 -top-24 hidden h-[420px] w-[420px] text-accent md:block"
        >
          <ellipse cx="200" cy="200" rx="180" ry="110" transform="rotate(-24 200 200)" fill="none" stroke="currentColor" strokeOpacity="0.25" />
          <ellipse cx="200" cy="200" rx="120" ry="70" transform="rotate(-24 200 200)" fill="none" stroke="currentColor" strokeOpacity="0.15" />
          <circle cx="200" cy="200" r="34" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeDasharray="3 6" />
          <circle cx="200" cy="200" r="12" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeOpacity="0.4" />
          <g transform="rotate(-24 200 200) translate(380 200)">
            <rect x="-7" y="-4" width="14" height="8" fill="currentColor" fillOpacity="0.9" />
            <rect x="-13" y="-2.5" width="4" height="5" fill="currentColor" fillOpacity="0.4" />
            <rect x="9" y="-2.5" width="4" height="5" fill="currentColor" fillOpacity="0.4" />
          </g>
        </svg>
      </section>

      {/* System status */}
      <section className="mb-12 mt-8 flex flex-wrap items-center justify-center gap-2">
        {loading && <StatusBadge label="Connecting" variant="warning" />}
        {error && <StatusBadge label="Simulation API offline" variant="danger" />}
        {health && (
          <>
            <StatusBadge label={`${health.app} v${health.version}`} variant="success" />
            <StatusBadge label="Simulation engine online" variant="success" />
          </>
        )}
        <StatusBadge label="Co-op sockets ready" variant="info" />
      </section>
    </div>
  );
}
