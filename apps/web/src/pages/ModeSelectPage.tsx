import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { RoleBadge } from "../components/RoleBadge";
import { Play, Users, History } from "lucide-react";
import { loadMissionSession, ROLE_IDS } from "../lib/mission";

/**
 * Mode Select — Solo vs Cooperative entry point.
 */
export function ModeSelectPage() {
  const navigate = useNavigate();
  const saved = loadMissionSession();
  const hasLiveSession = saved?.sessionId != null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <PageHeader
        kicker="Flight Operations"
        title="Choose Your Mission Mode"
        description="Fly alone with full station access, or crew up with up to 3 friends — each running a different station."
        className="mb-10"
      />

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card frame className="flex flex-col">
          <span aria-hidden className="mb-4 flex h-11 w-11 items-center justify-center border border-accent/40 bg-accent/10 text-accent">
            <Play className="h-5 w-5" />
          </span>
          <h2 className="mb-2 text-xl font-semibold text-ink">Solo Mission</h2>
          <p className="mb-4 flex-1 text-sm text-muted">
            Run the entire flight deck yourself. You hold all four crew roles
            and switch between stations freely — the full mission-control
            experience at your own pace.
          </p>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {ROLE_IDS.map((r) => (
              <RoleBadge key={r} role={r} size="sm" />
            ))}
          </div>
          <Button onClick={() => navigate("/missions")} className="w-full">
            Start Solo Mission
          </Button>
        </Card>

        <Card className="flex flex-col">
          <span aria-hidden className="mb-4 flex h-11 w-11 items-center justify-center border border-info/40 bg-info/10 text-info">
            <Users className="h-5 w-5" />
          </span>
          <h2 className="mb-2 text-xl font-semibold text-ink">Cooperative Crew</h2>
          <p className="mb-4 flex-1 text-sm text-muted">
            Create a private room or join with a 6-character code. Roles are
            assigned by crew size — decisions, telemetry and events are shared
            live through the room.
          </p>
          <ul className="mb-4 list-inside list-disc space-y-1 text-sm text-muted">
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
        <Card title="Continue Mission" icon={<History className="h-4 w-4" />} subtitle={`In progress: ${saved?.missionName} (${saved?.mode})`}>
          <div className="flex gap-2">
            <Button onClick={() => navigate(saved?.experience === "expert" || saved?.mode === "coop" ? "/operate" : "/play")}>
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
