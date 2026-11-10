import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { listMissions } from "../api/client";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { missionIcon } from "../lib/constants";
import { missionStory } from "../lib/kid";
import { saveMissionSession, newPlayerId } from "../lib/mission";
import { GraduationCap, TriangleAlert, ArrowRight } from "lucide-react";
import type { MissionBrief } from "../types";

const severityVariant = (difficulty: number) => {
  if (difficulty <= 2) return "success" as const;
  if (difficulty <= 3) return "warning" as const;
  return "danger" as const;
};

/** Kid-friendly difficulty stars (out of 5, matching the backend scale). */
function DifficultyStars({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-sm" aria-label={`Difficulty ${level} of 5`} role="img">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < level ? "" : "opacity-20 grayscale"} aria-hidden>
          ⭐
        </span>
      ))}
    </span>
  );
}

export function MissionsPage() {
  const navigate = useNavigate();
  const { data: missions, loading, error } = useApi(listMissions);

  const startFlight = (mId: string, mName: string) => {
    saveMissionSession({
      mode: "solo",
      missionId: mId,
      missionName: mName,
      spacecraftId: null,
      sessionId: null,
      playerId: newPlayerId(),
      roomCode: null,
      experience: "simple",
    });
    navigate(`/hangar?mission=${mId}`);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <PageHeader
        kicker="Orbital Crisis Response Campaign"
        title="Where will you fly today?"
        description="Select a global Earth-monitoring theater, configure your Orbital AI Data Center spacecraft in the hangar, and execute real-time observation & crosslink operations."
      />

      {/* Onboarding flight */}
      <div className="tactical-frame my-8 border border-accent/40 bg-accent/[0.05] p-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-accent" aria-hidden />
              <span className="micro-label text-accent">Orbital Systems Briefing</span>
            </div>
            <h2 className="text-lg font-semibold text-ink">Sunrise Orbit — Orbital Mechanics & Edge AI Primer</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Master Sun-Synchronous Orbit (SSO) solar/eclipse duty cycles, Stefan-Boltzmann thermal
              radiator rejection, and onboard neural inference compression before entering high-severity
              space weather theaters.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start md:self-center">
            <Button size="sm" variant="secondary" onClick={() => navigate("/help")}>
              Systems Manual
            </Button>
            <Button size="sm" onClick={() => startFlight("wildfire", "Wildfire Scout")}>
              Launch Wildfire Theater <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin border-t-2 border-accent" />
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Loading missions</p>
        </div>
      )}

      {error && missions && missions.length > 0 && (
        <div className="mb-6 flex items-center justify-between border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          <div className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4" aria-hidden />
            <span>API server offline — displaying bundled mission scenarios.</span>
          </div>
          <span className="micro-label border border-warn/30 bg-warn/10 px-2 py-1">
            Offline catalog
          </span>
        </div>
      )}

      {error && (!missions || missions.length === 0) && (
        <Card title="Error">
          <p className="text-crit">Failed to load missions: {error}</p>
          <p className="mt-2 text-sm text-faint">
            Make sure the API server is running on port 8000 or deployed to Render.
          </p>
        </Card>
      )}

      {missions && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {missions.map((mission: MissionBrief) => {
            const Icon = missionIcon(mission.id);
            return (
              <Card
                key={mission.id}
                title={mission.codename.toUpperCase()}
                icon={<Icon className="h-4 w-4" />}
                className="group"
              >
                <h3 className="text-xl font-semibold text-ink">{mission.name}</h3>
                <p className="mt-1.5 text-sm text-muted leading-relaxed">
                  {missionStory(mission.id)}
                </p>

                {/* Orbital & AI Pipeline Spec Strip */}
                <div className="mt-3 grid grid-cols-3 gap-2 border border-edge/80 bg-void/50 p-2.5 font-mono text-[11px]">
                  <div>
                    <span className="block text-[9px] uppercase text-faint">Orbit Regime</span>
                    <span className="text-ink font-semibold">
                      {mission.orbit_altitude_km} km · {mission.orbit_inclination_deg}°
                    </span>
                  </div>
                  <div>
                    <span className="block text-[9px] uppercase text-faint">Primary Sensor</span>
                    <span className="text-accent-hi font-semibold truncate block">
                      {mission.recommended_payload}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[9px] uppercase text-faint">Window</span>
                    <span className="text-ink font-semibold">{mission.duration_hours}h Ops</span>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-edge pt-3">
                  <DifficultyStars level={mission.difficulty} />
                  <StatusBadge
                    label={
                      mission.difficulty <= 2
                        ? "Tier I · Nominal LEO"
                        : mission.difficulty <= 3
                          ? "Tier II · High Data Load"
                          : "Tier III · Severe Hazard"
                    }
                    variant={severityVariant(mission.difficulty)}
                  />
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <Button
                    size="sm"
                    onClick={() => startFlight(mission.id, mission.name)}
                  >
                    🚀 Configure & Launch
                  </Button>
                  <button
                    type="button"
                    onClick={() => navigate(`/missions/${mission.id}/brief`)}
                    className="text-xs font-mono text-faint hover:text-muted underline cursor-pointer"
                  >
                    Technical Briefing <ArrowRight className="inline h-3 w-3" aria-hidden />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
