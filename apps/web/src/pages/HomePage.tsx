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
      <section className="grid-bg relative mt-10 border border-edge px-6 py-16 md:px-12 text-center">
        <p className="micro-label text-faint">LumenOS Space Academy</p>
        <h1 className="mt-3 text-4xl md:text-5xl font-bold text-ink leading-tight">
          Fly your own satellite!
        </h1>
        <p className="mt-3 text-muted text-base md:text-lg max-w-xl mx-auto">
          Pick a mission, build your spaceship, and take photos of Earth from space.
          No physics homework — just flying.
        </p>

        <div className="mt-10">
          <button
            type="button"
            onClick={() => navigate("/missions")}
            className="inline-flex items-center gap-3 rounded-full bg-emerald-400 px-10 py-4 text-xl font-bold text-ink shadow-lg hover:bg-emerald-300 hover:scale-[1.02] transition-all"
          >
            <Rocket className="h-6 w-6" aria-hidden />
            PLAY
          </button>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
          <button type="button" onClick={() => navigate("/coop")} className="inline-flex items-center gap-1.5 text-muted hover:text-ink">
            <Users className="h-4 w-4" aria-hidden /> Fly with Friends
          </button>
          <button type="button" onClick={() => navigate("/rewards")} className="inline-flex items-center gap-1.5 text-muted hover:text-ink">
            🏅 My Rewards
          </button>
          <button type="button" onClick={() => navigate("/design")} className="inline-flex items-center gap-1.5 text-muted hover:text-ink">
            <Wrench className="h-4 w-4" aria-hidden /> Expert Console
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
