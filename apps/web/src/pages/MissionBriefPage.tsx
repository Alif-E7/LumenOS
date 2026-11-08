import { useNavigate, useParams } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { getMission } from "../api/client";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ContractCard } from "../components/ContractCard";
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
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-accent mx-auto mb-4" />
        <p className="text-muted">Loading mission brief…</p>
      </div>
    );
  }

  if (error || !mission) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Card title="Mission Not Available" icon="⚠️">
          <p className="text-crit text-sm">{error ?? "Unknown mission"}</p>
          <p className="text-sm text-ink0 mt-2">
            The API server may be offline — start it on port 8000 and reload.
          </p>
          <Button variant="secondary" className="mt-4" onClick={() => navigate("/missions")}>
            Back to Mission Campaign
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-4xl" aria-hidden>{mission.icon}</span>
        <div>
          <h1 className="text-3xl font-bold text-ink">{mission.name}</h1>
          <p className="text-muted">Operation “{mission.codename}” — Mission Brief</p>
        </div>
      </div>

      <ContractCard mission={mission} className="my-8" />

      <div className="flex flex-col sm:flex-row gap-3 justify-end">
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
