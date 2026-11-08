import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { getHealth } from "../api/client";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { MISSIONS } from "../lib/constants";
import { loadMissionSession } from "../lib/mission";
import { Rocket, Users, DraftingCompass, ArrowRight, Radio } from "lucide-react";

function DifficultyTicks({ level }: { level: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`Difficulty ${level} of 5`}
      role="img"
    >
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`h-3 w-0.5 ${i < level ? "bg-accent" : "bg-edge-strong"}`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const { data: health, loading, error } = useApi(getHealth);
  const session = loadMissionSession();

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      {/* Active mission banner */}
      {session && session.sessionId && (
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
          <Button size="sm" onClick={() => navigate("/operate")}>
            Resume Control <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      )}

      {/* Hero */}
      <section className="grid-bg relative mt-10 border border-edge px-6 py-16 md:px-12">
        <div className="relative z-10">
          <PageHeader
            kicker="Orbital Operations Simulator"
            title="LumenOS"
            description="Design, launch and fly realistic satellite missions. Real astrodynamics, live telemetry, real consequences."
            className="max-w-3xl"
          />
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={() => navigate("/mode")}>
              <Rocket className="h-4 w-4" aria-hidden /> Start Solo Mission
            </Button>
            <Button size="lg" variant="secondary" onClick={() => navigate("/coop")}>
              <Users className="h-4 w-4" aria-hidden /> Multiplayer Co-op Room
            </Button>
            <Button size="lg" variant="ghost" onClick={() => navigate("/design")}>
              <DraftingCompass className="h-4 w-4" aria-hidden /> Spacecraft Designer
            </Button>
          </div>
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

      {/* Mission scenarios */}
      <section className="mt-12">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="micro-label text-faint">Mission Scenarios</h2>
          <Button variant="ghost" size="sm" onClick={() => navigate("/missions")}>
            All scenarios <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Object.values(MISSIONS).map((m) => {
            const Icon = m.Icon;
            return (
              <Card
                key={m.id}
                title={m.codename.toUpperCase()}
                icon={<Icon className="h-4 w-4" />}
                onClick={() => navigate(`/missions/${m.id}/brief`)}
                className="group"
              >
                <h3 className="text-lg font-semibold text-ink">{m.name}</h3>
                <p className="mt-2 min-h-10 text-sm text-muted">{m.description}</p>
                <div className="mt-4 flex items-center justify-between border-t border-edge pt-3">
                  <DifficultyTicks level={m.difficulty} />
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-accent opacity-0 transition-opacity group-hover:opacity-100">
                    Briefing →
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Flight loop */}
      <section className="mt-12 border border-edge bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-4">
          {["Design", "Validate", "Launch", "Operate", "Analyze"].map((step, i, arr) => (
            <span key={step} className="flex items-center gap-3">
              <span className="flex items-center gap-2">
                <span className="data-readout text-[10px] text-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-mono text-xs uppercase tracking-[0.12em] text-muted">
                  {step}
                </span>
              </span>
              {i < arr.length - 1 && (
                <span aria-hidden className="hidden h-px w-10 bg-edge-strong sm:block" />
              )}
            </span>
          ))}
          <Button size="sm" variant="secondary" onClick={() => navigate("/missions")}>
            Begin
          </Button>
        </div>
      </section>

      {/* System status */}
      <section className="mb-12 mt-8 flex flex-wrap items-center gap-2">
        <span className="micro-label mr-1 text-faint">Console status</span>
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
