import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { RoleBadge } from "../components/RoleBadge";
import { Play, Users, History, Radio } from "lucide-react";
import { loadMissionSession, ROLE_IDS } from "../lib/mission";

export function ModeSelectPage() {
  const navigate = useNavigate();
  const saved = loadMissionSession();
  const hasLiveSession = saved?.sessionId != null;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-10 pb-16 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-slate-800/90 bg-gradient-to-r from-slate-950 via-slate-900/90 to-cyan-950/30 p-6 sm:p-8 shadow-2xl mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/40 bg-cyan-500/10 text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-300 mb-2">
          <Radio className="h-3 w-3 animate-pulse" /> Orbital Flight Operations · Crew Configuration
        </div>
        <h1 className="text-3xl font-bold text-ink tracking-tight">
          Choose Your Mission Mode
        </h1>
        <p className="mt-1.5 text-sm sm:text-base text-slate-300 max-w-2xl leading-relaxed">
          Command the entire Orbital AI Spacecraft and 4-station flight deck solo, or synchronize live
          telemetry with up to 3 crewmates in a cooperative multiplayer room.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-cyan-500/40 bg-gradient-to-b from-cyan-950/30 via-slate-950 to-slate-950 p-6 shadow-xl flex flex-col justify-between">
          <div>
            <span
              aria-hidden
              className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-500/15 text-cyan-300"
            >
              <Play className="h-5 w-5" />
            </span>
            <h2 className="mb-2 text-2xl font-bold text-slate-100">Solo Mission</h2>
            <p className="mb-4 text-sm text-slate-300 leading-relaxed">
              Run the entire flight deck yourself. You hold all four crew roles and switch seamlessly
              between the 3D Orbital Flight View and the 4-station engineering consoles.
            </p>
            <div className="mb-6 flex flex-wrap gap-1.5">
              {ROLE_IDS.map((r) => (
                <RoleBadge key={r} role={r} size="sm" />
              ))}
            </div>
          </div>
          <Button onClick={() => navigate("/missions")} className="w-full">
            Start Solo Mission
          </Button>
        </div>

        <div className="rounded-2xl border border-slate-800/90 bg-gradient-to-b from-slate-900/60 via-slate-950 to-slate-950 p-6 shadow-xl flex flex-col justify-between">
          <div>
            <span
              aria-hidden
              className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-500/15 text-amber-300"
            >
              <Users className="h-5 w-5" />
            </span>
            <h2 className="mb-2 text-2xl font-bold text-slate-100">Cooperative Crew</h2>
            <p className="mb-4 text-sm text-slate-300 leading-relaxed">
              Create a private room or join with a 6-character code. Roles are assigned by crew size —
              decisions, telemetry, and orbital events are synchronized live via WebSockets.
            </p>
            <ul className="mb-6 list-inside list-disc space-y-1.5 text-xs font-mono text-slate-300">
              <li>1–4 players, zero account registration required</li>
              <li>Host launches the orbital session from the crew lobby</li>
              <li>Real-time synchronized telemetry & station actions</li>
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button onClick={() => navigate("/coop/create")}>Create Room</Button>
            <Button variant="secondary" onClick={() => navigate("/coop/join")}>
              Join Room
            </Button>
          </div>
        </div>
      </div>

      {hasLiveSession && (
        <Card
          title="Continue Active Sortie"
          icon={<History className="h-4 w-4" />}
          subtitle={`In progress: ${saved?.missionName} (${saved?.mode})`}
        >
          <div className="flex gap-2">
            <Button
              onClick={() =>
                navigate(
                  saved?.experience === "expert" || saved?.mode === "coop" ? "/operate" : "/play"
                )
              }
            >
              Resume Flight
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate("/results")}
              title="Results appear here once the mission ends"
            >
              View Results
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
