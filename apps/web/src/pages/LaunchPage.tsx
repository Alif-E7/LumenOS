import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { StatusBadge } from "../components/StatusBadge";
import { startGame } from "../api/client";
import { loadMissionSession, saveMissionSession } from "../lib/mission";
import { OctagonX, Rocket, Check } from "lucide-react";

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
  const [countdown, setCountdown] = useState<number | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Checklist progresses automatically; pausing when finished.
  useEffect(() => {
    if (step >= CHECKLIST.length || countdown !== null) return;
    const t = setTimeout(() => setStep((s) => s + 1), 350);
    return () => clearTimeout(t);
  }, [step, countdown]);

  // Ignition countdown — navigates once the clock hits zero and the session exists.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      if (sessionReady) navigate("/operate");
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c ?? 1) - 1), 600);
    return () => clearTimeout(t);
  }, [countdown, sessionReady, navigate]);

  const launch = () => {
    if (!session?.missionId) {
      setError("No mission selected — return to the campaign.");
      return;
    }
    setError(null);
    setCountdown(5);
    startGame({
      mission_id: session.missionId,
      spacecraft_id: session.spacecraftId ?? undefined,
      player_ids: [session.playerId],
    })
      .then((result) => {
        saveMissionSession({ ...session, sessionId: result.session_id });
        setSessionReady(true);
      })
      .catch((err: Error) => {
        setError(err.message);
        setCountdown(null);
      });
  };

  if (!session?.missionId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Card title="Launch Blocked" icon={<OctagonX className="h-4 w-4" />}>
          <p className="mb-4 text-sm text-muted">
            No mission contract accepted yet. Pick a mission first.
          </p>
          <Button onClick={() => navigate("/missions")}>Go to Mission Campaign</Button>
        </Card>
      </div>
    );
  }

  const ready = step >= CHECKLIST.length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="micro-label mb-2 text-accent">Ignition Sequence</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">
          Launch — {session.missionName}
        </h1>
        <p className="mt-2 flex items-center gap-2 text-sm text-muted">
          Pre-flight checklist running.
          <StatusBadge label={session.mode === "solo" ? "SOLO — ALL STATIONS" : "CO-OP CREW"} variant="info" />
        </p>
      </div>

      <Card frame className="mb-8">
        <ul className="space-y-2.5" aria-label="Launch checklist">
          {CHECKLIST.map((item, i) => (
            <li key={item} className="flex items-center gap-3 text-sm">
              <span
                className={`inline-flex h-4 w-4 items-center justify-center border ${
                  i < step ? "border-ok bg-ok/15 text-ok" : "border-edge-strong text-faint"
                }`}
                aria-hidden
              >
                {i < step && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className={i < step ? "text-ink" : "text-faint"}>{item}</span>
              {i < step && (
                <span className="micro-label ml-auto text-ok">GO</span>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {error && (
        <Card title="Launch Failed" className="mb-6">
          <p className="text-sm text-crit">{error}</p>
          <p className="mt-2 text-sm text-faint">
            Make sure the API server is running on port 8000.
          </p>
        </Card>
      )}

      {/* Ignition overlay */}
      {countdown !== null && countdown > 0 && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-void/90 backdrop-blur-sm"
          role="alert"
          aria-live="assertive"
        >
          <p className="micro-label mb-4 text-muted">T-minus</p>
          <p className="data-readout text-glow text-[120px] font-bold leading-none text-accent animate-flicker">
            {countdown}
          </p>
          <p className="micro-label mt-4 text-faint">Avionics online · awaiting liftoff</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("/review")}>
          ← Back to Review
        </Button>
        <Button size="lg" onClick={launch} disabled={!ready || countdown !== null}>
          <Rocket className="h-4 w-4" aria-hidden />
          {countdown !== null ? "LIFTOFF" : ready ? "Initiate Launch" : "Checklist in progress…"}
        </Button>
      </div>
    </div>
  );
}
