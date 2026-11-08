import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { listMissions } from "../api/client";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { missionIcon } from "../lib/constants";
import { GraduationCap, TriangleAlert, ArrowRight } from "lucide-react";
import type { MissionBrief } from "../types";

const severityVariant = (difficulty: number) => {
  if (difficulty <= 2) return "success" as const;
  if (difficulty <= 3) return "warning" as const;
  return "danger" as const;
};

export function MissionsPage() {
  const navigate = useNavigate();
  const { data: missions, loading, error } = useApi(listMissions);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <PageHeader
        kicker="Campaign"
        title="Mission Scenarios"
        description="Select a mission to begin spacecraft configuration and launch."
      />

      {/* Onboarding flight */}
      <div className="tactical-frame my-8 border border-accent/40 bg-accent/[0.05] p-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-accent" aria-hidden />
              <span className="micro-label text-accent">Recommended onboarding</span>
            </div>
            <h2 className="text-lg font-semibold text-ink">Sunrise Orbit — Flight Academy</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Learn Low Earth Orbit fundamentals: orbital speed, solar power collection,
              eclipse crossings, and battery depth-of-discharge management.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start md:self-center">
            <Button size="sm" variant="secondary" onClick={() => navigate("/help")}>
              Tutorial Guide
            </Button>
            <Button size="sm" onClick={() => navigate("/missions/wildfire/brief")}>
              Start Guided Flight <ArrowRight className="h-3.5 w-3.5" aria-hidden />
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
          <p className="text-crit">
            Failed to load missions: {error}
          </p>
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
                <h3 className="text-lg font-semibold text-ink">{mission.name}</h3>
                <p className="mt-1.5 text-sm text-muted">{mission.description}</p>

                <div className="data-readout mb-4 mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div className="flex justify-between border-b border-edge/60 pb-1">
                    <span className="text-faint">ALT</span>
                    <span className="text-ink">{mission.orbit_altitude_km} km</span>
                  </div>
                  <div className="flex justify-between border-b border-edge/60 pb-1">
                    <span className="text-faint">INC</span>
                    <span className="text-ink">{mission.orbit_inclination_deg}°</span>
                  </div>
                  <div className="flex justify-between border-b border-edge/60 pb-1">
                    <span className="text-faint">DUR</span>
                    <span className="text-ink">{mission.duration_hours} h</span>
                  </div>
                  <div className="flex justify-between border-b border-edge/60 pb-1">
                    <span className="text-faint">PAYLOAD</span>
                    <span className="truncate text-ink">{mission.recommended_payload.replace(/_/g, " ")}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-edge pt-3">
                  <StatusBadge
                    label={`Difficulty ${mission.difficulty}/5`}
                    variant={severityVariant(mission.difficulty)}
                  />
                  <div className="flex max-w-[55%] flex-wrap justify-end gap-1">
                    {mission.tags?.map((tag) => (
                      <span
                        key={tag}
                        className="border border-edge bg-raised px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted"
                      >
                        {tag.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <Button size="sm" onClick={() => navigate(`/missions/${mission.id}/brief`)}>
                    Review Brief & Contract <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
