import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { listMissions } from "../api/client";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { missionIcon } from "../lib/constants";
import { missionStory } from "../lib/kid";
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <PageHeader
        kicker="Pick a mission"
        title="Where will you fly today?"
        description="Choose a mission, build your ship in the hangar, and launch!"
      />

      {/* Onboarding flight */}
      <div className="tactical-frame my-8 border border-accent/40 bg-accent/[0.05] p-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-accent" aria-hidden />
              <span className="micro-label text-accent">First flight?</span>
            </div>
            <h2 className="text-lg font-semibold text-ink">Sunrise Orbit — Flight Academy</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Learn the basics: how your spaceship stays powered, what happens when it flies
              through Earth's shadow, and how to keep the battery happy.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start md:self-center">
            <Button size="sm" variant="secondary" onClick={() => navigate("/help")}>
              How to play
            </Button>
            <Button size="sm" onClick={() => navigate("/hangar?mission=wildfire")}>
              Start Flying <ArrowRight className="h-3.5 w-3.5" aria-hidden />
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

                <div className="mt-4 flex items-center justify-between border-t border-edge pt-3">
                  <DifficultyStars level={mission.difficulty} />
                  <StatusBadge
                    label={mission.difficulty <= 2 ? "Good for beginners" : mission.difficulty <= 3 ? "A bit tricky" : "Expert pilots"}
                    variant={severityVariant(mission.difficulty)}
                  />
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <Button
                    size="sm"
                    onClick={() => navigate(`/hangar?mission=${mission.id}`)}
                  >
                    🚀 Fly this mission
                  </Button>
                  <button
                    type="button"
                    onClick={() => navigate(`/missions/${mission.id}/brief`)}
                    className="text-xs text-faint hover:text-muted underline"
                  >
                    Full briefing <ArrowRight className="inline h-3 w-3" aria-hidden />
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
