import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { listMissions } from "../api/client";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { StatusBadge } from "../components/StatusBadge";
import type { MissionBrief } from "../types";

const severityBadge = (difficulty: number) => {
  if (difficulty <= 2) return <StatusBadge label={`Difficulty ${difficulty}/5`} variant="success" />;
  if (difficulty <= 3) return <StatusBadge label={`Difficulty ${difficulty}/5`} variant="warning" />;
  return <StatusBadge label={`Difficulty ${difficulty}/5`} variant="danger" />;
};

export function MissionsPage() {
  const navigate = useNavigate();
  const { data: missions, loading, error } = useApi(listMissions);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-white mb-2">Mission Scenarios</h1>
      <p className="text-slate-400 mb-6">
        Select a mission to begin spacecraft configuration and launch.
      </p>

      {/* Onboarding Tutorial Banner */}
      <div className="mb-8 p-6 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-950/40 via-slate-900/60 to-blue-950/30 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">🌅</span>
              <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                Recommended Onboarding
              </span>
              <span className="text-xs text-slate-400">Tutorial Flight</span>
            </div>
            <h2 className="text-xl font-bold text-white">Sunrise Orbit — Flight Academy</h2>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl">
              Learn the fundamentals of Low Earth Orbit: orbital speed, solar power collection,
              entering Earth's shadow (eclipse), and managing battery depth-of-discharge.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start md:self-center shrink-0">
            <Button size="sm" variant="secondary" onClick={() => navigate("/help")}>
              Tutorial Guide
            </Button>
            <Button size="sm" onClick={() => navigate("/missions/wildfire/brief")}>
              Start Guided Flight →
            </Button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500 mx-auto mb-4" />
          <p className="text-slate-400">Loading missions...</p>
        </div>
      )}

      {error && (
        <Card title="Error" icon="⚠️">
          <p className="text-red-400">
            Failed to load missions: {error}
          </p>
          <p className="text-sm text-slate-500 mt-2">
            Make sure the API server is running on port 8000.
          </p>
        </Card>
      )}

      {missions && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {missions.map((mission: MissionBrief) => (
            <Card
              key={mission.id}
              icon={mission.icon}
              title={mission.name}
              subtitle={mission.codename}
              className="hover:border-blue-500/50 transition-all"
            >
              <p className="text-sm text-slate-400 mb-4">{mission.description}</p>

              <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                <div>
                  <span className="text-slate-500">Altitude:</span>{" "}
                  <span className="text-slate-300">{mission.orbit_altitude_km} km</span>
                </div>
                <div>
                  <span className="text-slate-500">Inclination:</span>{" "}
                  <span className="text-slate-300">{mission.orbit_inclination_deg}°</span>
                </div>
                <div>
                  <span className="text-slate-500">Duration:</span>{" "}
                  <span className="text-slate-300">{mission.duration_hours} hours</span>
                </div>
                <div>
                  <span className="text-slate-500">Payload:</span>{" "}
                  <span className="text-slate-300">
                    {mission.recommended_payload.replace(/_/g, " ")}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                {severityBadge(mission.difficulty)}
                <div className="flex gap-1">
                  {mission.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-3 flex justify-end">
                <Button size="sm" onClick={() => navigate(`/missions/${mission.id}/brief`)}>
                  Review Brief & Contract →
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

