import { useNavigate, useParams } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { getMission } from "../api/client";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { ContractCard } from "../components/ContractCard";
import { missionIcon } from "../lib/constants";
import { saveMissionSession, loadMissionSession, newPlayerId, type MissionSession } from "../lib/mission";

/**
 * Mission Brief — the contract review step before configuring the spacecraft.
 */
export function MissionBriefPage() {
  const { missionId } = useParams<{ missionId: string }>();
  const navigate = useNavigate();
  const { data: mission, loading, error } = useApi(
    () => getMission(missionId ?? ""),
    [missionId]
  );

  const acceptContract = () => {
    if (!mission) return;
    const existing = loadMissionSession();
    const session: MissionSession = {
      mode: existing?.mode ?? "solo",
      missionId: mission.id,
      missionName: mission.name,
      spacecraftId: existing?.missionId === mission.id ? existing.spacecraftId : null,
      sessionId: null,
      playerId: existing?.playerId ?? newPlayerId(),
      roomCode: existing?.roomCode ?? null,
    };
    saveMissionSession(session);
    navigate("/design");
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin border-t-2 border-accent" />
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Loading brief</p>
      </div>
    );
  }

  if (error || !mission) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <Card title="Mission Not Available">
          <p className="text-sm text-crit">{error ?? "Unknown mission"}</p>
          <p className="mt-2 text-sm text-faint">
            The API server may be offline — start it on port 8000 and reload.
          </p>
          <Button variant="secondary" className="mt-4" onClick={() => navigate("/missions")}>
            Back to Mission Campaign
          </Button>
        </Card>
      </div>
    );
  }

  const Icon = missionIcon(mission.id);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center gap-4">
        <span className="flex h-12 w-12 items-center justify-center border border-accent/40 bg-accent/10 text-accent">
          <Icon className="h-6 w-6" aria-hidden />
        </span>
        <PageHeader
          kicker={`Operation “${mission.codename}” · Mission Brief`}
          title={mission.name}
        />
      </div>

      <ContractCard mission={mission} className="my-8" frame />

      <div className="flex flex-col justify-end gap-3 sm:flex-row">
        <Button variant="ghost" onClick={() => navigate("/missions")}>
          Back to Campaign
        </Button>
        <Button onClick={acceptContract}>
          Accept Contract → Configure Spacecraft
        </Button>
      </div>
    </div>
  );
}
