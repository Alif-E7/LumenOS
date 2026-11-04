import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { RoleBadge } from "../components/RoleBadge";
import { loadMissionSession } from "../lib/mission";
import { ROLE_IDS } from "../lib/mission";

/**
 * Mode Select — Solo vs Cooperative entry point.
 */
export function ModeSelectPage() {
  const navigate = useNavigate();
  const saved = loadMissionSession();
  const hasLiveSession = saved?.sessionId != null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-white mb-2">Choose Your Mission Mode</h1>
      <p className="text-slate-400 mb-10">
        Fly alone with full station access, or crew up with up to 3 friends —
        each running a different station.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card className="flex flex-col">
          <div className="text-4xl mb-3" aria-hidden>🧑‍🚀</div>
          <h2 className="text-xl font-bold text-white mb-2">Solo Mission</h2>
          <p className="text-sm text-slate-400 mb-4 flex-1">
            Run the entire flight deck yourself. You hold all four crew roles
            and switch between stations freely — the full mission-control
            experience at your own pace.
          </p>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {ROLE_IDS.map((r) => (
              <RoleBadge key={r} role={r} size="sm" />
            ))}
          </div>
          <Button onClick={() => navigate("/missions")} className="w-full">
            Start Solo Mission
          </Button>
        </Card>

        <Card className="flex flex-col">
          <div className="text-4xl mb-3" aria-hidden>👥</div>
          <h2 className="text-xl font-bold text-white mb-2">Cooperative Crew</h2>
          <p className="text-sm text-slate-400 mb-4 flex-1">
            Create a private room or join with a 6-character code. Roles are
            assigned by crew size — decisions, telemetry and events are shared
            live through the room.
          </p>
          <ul className="text-sm text-slate-400 space-y-1 mb-4 list-disc list-inside">
            <li>1–4 players, no account needed</li>
            <li>Host starts the mission from the lobby</li>
            <li>Everyone sees the shared mission view</li>
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => navigate("/coop/create")}>Create Room</Button>
            <Button variant="secondary" onClick={() => navigate("/coop/join")}>
              Join Room
            </Button>
          </div>
        </Card>
      </div>

      {hasLiveSession && (
        <Card title="Continue Mission" icon="⏯️" subtitle={`In progress: ${saved?.missionName} (${saved?.mode})`}>
          <div className="flex gap-2">
            <Button onClick={() => navigate("/operate")}>Resume Mission Control</Button>
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
