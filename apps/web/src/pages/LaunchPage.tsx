import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { StatusBadge } from "../components/StatusBadge";
import { startGame } from "../api/client";
import { loadMissionSession, saveMissionSession } from "../lib/mission";

const CHECKLIST = [
  "Structure & mass budget verified",
  "Power generation within limits",
  "Thermal control responsive",
  "Comms antenna aligned",
  "Payload science modes calibrated",
  "Launch vehicle fuelled",
  "Range is GREEN",
];

/**
 * Launch — final checklist and ignition. Creates the backend game
 * session, then hands over to Mission Control.
 */
export function LaunchPage() {
  const navigate = useNavigate();
  const session = loadMissionSession();
  const [step, setStep] = useState(0);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Checklist progresses automatically; pausing when finished.
  useEffect(() => {
    if (step >= CHECKLIST.length || launching) return;
    const t = setTimeout(() => setStep((s) => s + 1), 350);
    return () => clearTimeout(t);
  }, [step, launching]);

  const launch = async () => {
    if (!session?.missionId) {
      setError("No mission selected — return to the campaign.");
      return;
    }
    setLaunching(true);
    setError(null);
    try {
      const result = await startGame({
        mission_id: session.missionId,
        spacecraft_id: session.spacecraftId ?? undefined,
        player_ids: [session.playerId],
      });
      saveMissionSession({ ...session, sessionId: result.session_id });
      navigate("/operate");
    } catch (err) {
      setError((err as Error).message);
      setLaunching(false);
    }
  };

  if (!session?.missionId) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Card title="Launch Blocked" icon="⛔">
          <p className="text-muted text-sm mb-4">
            No mission contract accepted yet. Pick a mission first.
          </p>
          <Button onClick={() => navigate("/missions")}>Go to Mission Campaign</Button>
        </Card>
      </div>
    );
  }

  const ready = step >= CHECKLIST.length;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-ink mb-2">Launch — {session.missionName}</h1>
      <p className="text-muted mb-8">
        Pre-flight checklist running. Mode:{" "}
        <StatusBadge label={session.mode === "solo" ? "SOLO — ALL STATIONS" : "CO-OP CREW"} variant="info" />
      </p>

      <Card className="mb-8">
        <ul className="space-y-2" aria-label="Launch checklist">
          {CHECKLIST.map((item, i) => (
            <li key={item} className="flex items-center gap-3 text-sm">
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs ${
                  i < step
                    ? "border-ok bg-ok/20 text-ok"
                    : "border-edge-strong text-faint"
                }`}
                aria-hidden
              >
                {i < step ? "✓" : "·"}
              </span>
              <span className={i < step ? "text-ink" : "text-ink0"}>{item}</span>
            </li>
          ))}
        </ul>
      </Card>

      {error && (
        <Card title="Launch Failed" icon="⚠️" className="mb-6">
          <p className="text-crit text-sm">{error}</p>
          <p className="text-sm text-ink0 mt-2">
            Make sure the API server is running on port 8000.
          </p>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("/review")}>
          ← Back to Review
        </Button>
        <Button size="lg" onClick={launch} disabled={!ready || launching}>
          {launching ? "Ignition…" : ready ? "🚀 LAUNCH" : "Checklist in progress…"}
        </Button>
      </div>
    </div>
  );
}
