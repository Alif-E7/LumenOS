import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { StatusBadge } from "../components/StatusBadge";
import { getMissionReplay, runWhatIf, listReplays } from "../api/client";
import { loadMissionSession } from "../lib/mission";
import type {
  MissionTrajectoryRecord,
  KeyEvent,
  WhatIfComparisonResult,
  ReplayListItem,
} from "../types";

function formatSeconds(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return `T+${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const STRATEGY_PRESETS = [
  {
    id: "eco_mode",
    label: "Switch Operational Profile to ECO",
    description: "Cuts onboard compute power to preserve battery during eclipse passes.",
    action_type: "set_operational_profile",
    params: { profile: "ECO" },
  },
  {
    id: "safe_mode",
    label: "Execute Safe Mode Contingency",
    description: "Sheds all non-critical scientific payloads to halt battery depletion.",
    action_type: "set_power_mode",
    params: { mode: "safe" },
  },
  {
    id: "downlink_alerts",
    label: "Prioritize Emergency Alerts Downlink",
    description: "Forces downlink queue to prioritize verified anomaly alerts before raw science.",
    action_type: "set_downlink_priority",
    params: { mode: "ALERTS" },
  },
  {
    id: "payload_standby",
    label: "Power Down Optical & Radar Payloads",
    description: "Isolates instrument power to arrest thermal heating.",
    action_type: "toggle_subsystem",
    params: { subsystem: "payload", active: false },
  },
];

export function ReplayPage() {
  const navigate = useNavigate();
  const session = loadMissionSession();

  const [trajectory, setTrajectory] = useState<MissionTrajectoryRecord | null>(null);
  const [replaysList, setReplaysList] = useState<ReplayListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Scrubber & Playback state
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playIntervalRef = useRef<number | null>(null);

  // What-If state
  const [selectedStrategyId, setSelectedStrategyId] = useState("eco_mode");
  const [whatIfLoading, setWhatIfLoading] = useState(false);
  const [whatIfResult, setWhatIfResult] = useState<WhatIfComparisonResult | null>(null);
  const [whatIfError, setWhatIfError] = useState<string | null>(null);

  useEffect(() => {
    const targetSessionId = session?.sessionId || "demo";

    getMissionReplay(targetSessionId)
      .then((data) => {
        setTrajectory(data);
        setCurrentStepIndex(data.steps.length > 0 ? 0 : 0);
      })
      .catch((err) => {
        // Fallback: list replays or try demo
        listReplays()
          .then((list) => {
            setReplaysList(list);
            if (list.length > 0) {
              return getMissionReplay(list[0].session_id).then((t) => setTrajectory(t));
            } else {
              return getMissionReplay("demo").then((t) => setTrajectory(t));
            }
          })
          .catch(() => setError(err.message));
      })
      .finally(() => setLoading(false));
  }, [session?.sessionId]);

  // Playback timer
  useEffect(() => {
    if (isPlaying) {
      const intervalMs = Math.max(50, 400 / playbackSpeed);
      playIntervalRef.current = window.setInterval(() => {
        setCurrentStepIndex((prev) => {
          if (!trajectory || prev >= trajectory.steps.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, intervalMs);
    } else {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, playbackSpeed, trajectory]);

  const handleSeek = (stepIdx: number) => {
    if (!trajectory) return;
    const clamped = Math.max(0, minStep(stepIdx, trajectory.steps.length - 1));
    setCurrentStepIndex(clamped);
  };

  const minStep = (a: number, b: number) => (a < b ? a : b);

  const handleJumpToEvent = (eventStep: number) => {
    if (!trajectory) return;
    const foundIdx = trajectory.steps.findIndex((s) => s.step >= eventStep);
    if (foundIdx !== -1) {
      setCurrentStepIndex(foundIdx);
    }
  };

  const handleRunWhatIf = async () => {
    if (!trajectory) return;
    setWhatIfLoading(true);
    setWhatIfError(null);

    const stepNum = trajectory.steps[currentStepIndex]?.step || currentStepIndex + 1;
    const preset = STRATEGY_PRESETS.find((p) => p.id === selectedStrategyId) || STRATEGY_PRESETS[0];

    try {
      const res = await runWhatIf(trajectory.session_id, {
        branch_step: stepNum,
        modified_actions: [
          {
            actor: "what_if_specialist",
            action_type: preset.action_type,
            params: preset.params,
          },
        ],
        label: preset.label,
      });
      setWhatIfResult(res);
    } catch (e: any) {
      setWhatIfError(e.message || "Failed to execute What-If branch simulation.");
    } finally {
      setWhatIfLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-accent mx-auto mb-4" />
        <p className="text-muted">Loading mission trajectory replay & telemetry archives…</p>
      </div>
    );
  }

  if (error && !trajectory) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Card title="Replay Not Available" icon="⚠️">
          <p className="text-crit text-sm mb-3">{error}</p>
          <p className="text-muted text-sm mb-4">
            Replays require a recorded mission session. Launch one from Mission Control or fly a campaign contract.
          </p>
          <div className="flex gap-3">
            <Button onClick={() => navigate("/missions")}>Mission Campaign</Button>
            <Button variant="secondary" onClick={() => navigate("/")}>Back to Home</Button>
          </div>
        </Card>
      </div>
    );
  }

  const currentStep = trajectory?.steps[currentStepIndex] || trajectory?.steps[0];
  const tel = currentStep?.telemetry || {};
  const orb = tel.orbital || {};
  const pwr = tel.power || {};
  const therm = tel.thermal || {};
  const comm = tel.comms || {};
  const stor = tel.storage || {};
  const work = tel.workload || {};

  const totalSteps = trajectory?.steps.length || 1;
  const currentStepNum = currentStep?.step || 1;
  const elapsedSec = currentStep?.elapsed_seconds || 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-edge">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-ink">Mission Replay & What-If Studio</h1>
            <span className="px-2 py-0.5 text-2xs font-mono uppercase bg-accent/10/60 text-accent-hi border border-blue-800 rounded">
              Deterministic Trajectory
            </span>
          </div>
          <p className="text-xs text-muted">
            Satellite: <span className="text-ink">{trajectory?.spacecraft_name}</span> | Seed:{" "}
            <span className="text-ink font-mono">{trajectory?.seed}</span> | Session:{" "}
            <span className="text-muted font-mono">{trajectory?.session_id}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {replaysList.length > 1 && (
            <select
              value={trajectory?.session_id}
              onChange={(e) => {
                getMissionReplay(e.target.value).then((t) => setTrajectory(t));
              }}
              className="text-xs bg-panel border border-edge-strong rounded px-2 py-1 text-ink"
            >
              {replaysList.map((r) => (
                <option key={r.session_id} value={r.session_id}>
                  {r.mission_id} ({r.grade} — {r.final_score} pts)
                </option>
              ))}
            </select>
          )}
          <Button variant="ghost" size="sm" onClick={() => navigate("/results")}>
            ← Back to Results
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate("/missions")}>
            Fly New Mission
          </Button>
        </div>
      </div>

      {/* Main Scrubber Transport Card */}
      <Card title="Operational Timeline Scrubber" icon="⏱️" className="mb-6">
        <div className="flex flex-col gap-4">
          {/* Timeline slider and time readout */}
          <div className="flex items-center justify-between text-xs text-muted">
            <div className="flex items-center gap-3">
              <span className="text-lg font-mono font-bold text-ink">{formatSeconds(elapsedSec)}</span>
              <span className="px-2 py-0.5 rounded bg-raised text-ink font-mono">
                Step {currentStepNum} / {totalSteps}
              </span>
              <StatusBadge
                label={orb.in_eclipse ? "In Shadow (Eclipse)" : "Sunlit Orbit"}
                variant={orb.in_eclipse ? "warning" : "success"}
              />
              {comm.in_contact && (
                <StatusBadge label={`Contact: ${comm.active_station ?? "AOS"}`} variant="success" />
              )}
            </div>

            <div className="flex items-center gap-1">
              <span className="text-2xs text-ink0 uppercase mr-1">Speed:</span>
              {[1, 2, 5, 10].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setPlaybackSpeed(spd)}
                  className={`px-2 py-0.5 rounded text-2xs font-mono ${
                    playbackSpeed === spd
                      ? "bg-accent text-ink font-bold"
                      : "bg-raised text-muted hover:text-ink"
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(0, totalSteps - 1)}
            value={currentStepIndex}
            onChange={(e) => handleSeek(parseInt(e.target.value, 10))}
            className="w-full h-2 bg-raised rounded-none appearance-none cursor-pointer accent-accent"
          />

          {/* Transport Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleSeek(0)}
                title="Rewind to start"
              >
                ⏮ Start
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleSeek(currentStepIndex - 1)}
                disabled={currentStepIndex === 0}
                title="Step backward"
              >
                ◀ Step
              </Button>
              <Button
                size="sm"
                onClick={() => setIsPlaying(!isPlaying)}
                className={isPlaying ? "bg-warn hover:bg-warn" : "bg-accent hover:bg-accent"}
              >
                {isPlaying ? "⏸ Pause" : "▶ Play"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleSeek(currentStepIndex + 1)}
                disabled={currentStepIndex >= totalSteps - 1}
                title="Step forward"
              >
                Step ▶
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleSeek(totalSteps - 1)}
                title="Jump to end"
              >
                End ⏭
              </Button>
            </div>

            <div className="text-xs text-muted">
              Spacecraft Health:{" "}
              <strong
                className={
                  (currentStep?.spacecraft_health_pct ?? 100) > 75
                    ? "text-ok"
                    : (currentStep?.spacecraft_health_pct ?? 100) > 30
                    ? "text-warn"
                    : "text-crit"
                }
              >
                {(currentStep?.spacecraft_health_pct ?? 100).toFixed(1)}%
              </strong>
            </div>
          </div>

          {/* Jump-to-Event Chips */}
          {trajectory?.key_events && trajectory.key_events.length > 0 && (
            <div className="mt-2 pt-3 border-t border-edge/80">
              <span className="text-2xs font-semibold uppercase text-ink0 block mb-2">
                Quick Jump to Key Events:
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {trajectory.key_events.map((ke: KeyEvent, i: number) => {
                  const isCurrent = currentStep?.step === ke.step;
                  return (
                    <button
                      key={i}
                      onClick={() => handleJumpToEvent(ke.step)}
                      className={`px-2.5 py-1 rounded text-xs flex items-center gap-1.5 border transition-all ${
                        isCurrent
                          ? "bg-accent/10/60 border-accent text-ink font-medium"
                          : ke.severity === "critical"
                          ? "bg-crit/10/40 border-red-900/60 text-crit hover:bg-red-900/40"
                          : ke.severity === "warning"
                          ? "bg-warn/10/40 border-amber-900/60 text-warn hover:bg-amber-900/40"
                          : "bg-void/60 border-edge text-ink hover:border-edge-strong"
                      }`}
                    >
                      <span className="font-mono text-2xs text-muted">{formatSeconds(ke.elapsed_seconds)}</span>
                      <span>{ke.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Subsystem Telemetry Snapshot at Current Step */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {/* Power Subsystem */}
        <div className="p-4 rounded-none bg-panel/80 border border-edge">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-warn">⚡ Power Bus</span>
            <span className="text-xs font-mono text-muted">
              {(pwr.battery_soc_pct ?? 100).toFixed(0)}% SoC
            </span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted">Solar Gen:</span>
              <span className="font-mono text-ink">{Math.round(pwr.solar_output_w ?? 0)} W</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Total Load:</span>
              <span className="font-mono text-ink">{Math.round(pwr.total_load_w ?? 0)} W</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Net Power:</span>
              <span
                className={`font-mono ${
                  (pwr.net_power_w ?? 0) >= 0 ? "text-ok" : "text-warn"
                }`}
              >
                {(pwr.net_power_w ?? 0) > 0 ? "+" : ""}
                {Math.round(pwr.net_power_w ?? 0)} W
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Battery Reserve:</span>
              <span className="font-mono text-ink">{Math.round(pwr.battery_soc_wh ?? 0)} Wh</span>
            </div>
          </div>
        </div>

        {/* Thermal Subsystem */}
        <div className="p-4 rounded-none bg-panel/80 border border-edge">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-info">🌡️ Thermal State</span>
            <span
              className={`text-xs font-mono font-bold ${
                (therm.temperature_c ?? 20) > 35
                  ? "text-crit"
                  : (therm.temperature_c ?? 20) < 5
                  ? "text-info"
                  : "text-ok"
              }`}
            >
              {(therm.temperature_c ?? 20).toFixed(1)} °C
            </span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted">Heat Input:</span>
              <span className="font-mono text-ink">{Math.round(therm.heat_input_w ?? 0)} W</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Heat Rejected:</span>
              <span className="font-mono text-ink">{Math.round(therm.heat_rejected_w ?? 0)} W</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Net Balance:</span>
              <span className="font-mono text-ink">{Math.round(therm.net_heat_w ?? 0)} W</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Heater:</span>
              <span className="font-mono text-ink">{therm.heater_active ? "ACTIVE" : "OFF"}</span>
            </div>
          </div>
        </div>

        {/* Comms & Data Downlink */}
        <div className="p-4 rounded-none bg-panel/80 border border-edge">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent">📡 Comms & Buffer</span>
            <span className="text-xs font-mono text-muted">
              {comm.in_contact ? comm.active_station ?? "AOS" : "LOS"}
            </span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted">Data Buffer:</span>
              <span className="font-mono text-ink">{Math.round(comm.data_buffer_mb ?? 0)} MB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Total Downlink:</span>
              <span className="font-mono text-ok">{Math.round(comm.data_downlinked_mb ?? 0)} MB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Downlink Rate:</span>
              <span className="font-mono text-ink">{(comm.current_data_rate_mbps ?? 0).toFixed(1)} Mbps</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Priority Mode:</span>
              <span className="font-mono text-ink">{comm.downlink_priority_mode ?? "BALANCED"}</span>
            </div>
          </div>
        </div>

        {/* Orbit & Workload */}
        <div className="p-4 rounded-none bg-panel/80 border border-edge">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">🛰️ Orbit & Compute</span>
            <span className="text-xs font-mono text-muted">{work.operational_profile ?? "FULL"}</span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted">Altitude:</span>
              <span className="font-mono text-ink">{Math.round(orb.altitude_km ?? 550)} km</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Velocity:</span>
              <span className="font-mono text-ink">{(orb.velocity_km_s ?? 7.6).toFixed(2)} km/s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Sub-Sat Lat/Lon:</span>
              <span className="font-mono text-ink">
                {(orb.latitude_deg ?? 0).toFixed(1)}°, {(orb.longitude_deg ?? 0).toFixed(1)}°
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">CPU Usage:</span>
              <span className="font-mono text-ink">{Math.round(work.cpu_usage_pct ?? 0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Storage Buffer:</span>
              <span className="font-mono text-ink">{Math.round(stor.used_pct ?? 0)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Decision & Action Audit for current step */}
      {currentStep?.actions && currentStep.actions.length > 0 && (
        <Card title="Recorded Flight Commands at This Step" icon="📋" className="mb-8">
          <div className="divide-y divide-edge text-xs">
            {currentStep.actions.map((act: any, idx: number) => (
              <div key={idx} className="py-2 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-ink mr-2">{act.action_type}</span>
                  <span className="text-muted">
                    by <strong className="text-accent">{act.role || "Operator"}</strong> ({act.actor || act.player_id})
                  </span>
                </div>
                <div className="font-mono text-ok uppercase text-2xs px-2 py-0.5 rounded bg-ok/10/40 border border-emerald-900/60">
                  {act.status || "EXECUTED"}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* What-If Branching Studio Card */}
      <Card
        title="What-If Branching Simulator"
        icon="🔀"
        className="mb-8 border-edge bg-raised"
      >
        <p className="text-xs text-muted mb-4">
          Fork execution from <strong className="text-ink">Step {currentStepNum}</strong> ({formatSeconds(elapsedSec)}) with a modified flight decision. The simulation deterministically propagates forward with the exact same seed and environmental stream.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-2xs font-semibold uppercase text-muted block mb-1.5">
              Select Alternate Decision to Inject:
            </label>
            <div className="space-y-2">
              {STRATEGY_PRESETS.map((strat) => (
                <label
                  key={strat.id}
                  className={`p-3 rounded-none border block cursor-pointer transition-all text-xs ${
                    selectedStrategyId === strat.id
                      ? "bg-accent/10/70 border-accent text-ink"
                      : "bg-void/50 border-edge text-ink hover:border-edge-strong"
                  }`}
                >
                  <input
                    type="radio"
                    name="what_if_strategy"
                    value={strat.id}
                    checked={selectedStrategyId === strat.id}
                    onChange={(e) => setSelectedStrategyId(e.target.value)}
                    className="sr-only"
                  />
                  <div className="font-medium text-ink">{strat.label}</div>
                  <div className="text-2xs text-muted mt-0.5">{strat.description}</div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col justify-between p-4 rounded-none bg-void/60 border border-edge text-xs">
            <div>
              <span className="text-xs font-semibold text-ink block mb-1">Branch Parameters:</span>
              <ul className="text-xs text-muted space-y-1 mb-4">
                <li>• Fork Step: <strong className="text-ink font-mono">Step {currentStepNum}</strong></li>
                <li>• Timeline Mark: <strong className="text-ink font-mono">{formatSeconds(elapsedSec)}</strong></li>
                <li>• Exogenous Seed: <strong className="text-ink font-mono">{trajectory?.seed}</strong> (Preserved)</li>
                <li>• Execution Engine: <strong className="text-ink">Deterministic Headless Runner</strong></li>
              </ul>
              <p className="text-2xs text-ink0 italic">
                Notice: What-If branched simulations will be strictly labeled as &apos;NEW SIMULATION (WHAT-IF)&apos; to maintain scientific and provenance integrity.
              </p>
            </div>

            <Button
              onClick={handleRunWhatIf}
              disabled={whatIfLoading}
              className="w-full mt-4 bg-accent hover:bg-accent text-ink font-semibold py-2.5 shadow-lg shadow-accent/20"
            >
              {whatIfLoading ? "Computing Deterministic What-If Fork…" : `Run What-If Branch from Step ${currentStepNum} →`}
            </Button>
          </div>
        </div>

        {whatIfError && (
          <div className="p-3 rounded bg-crit/10/60 border border-red-800 text-xs text-crit mb-4">
            {whatIfError}
          </div>
        )}

        {/* What-If Side-by-Side Comparison Output */}
        {whatIfResult && (
          <div className="mt-6 pt-6 border-t border-edge">
            {/* Prominent Semantic Tag */}
            <div className="p-3 rounded-none bg-indigo-950/80 border border-indigo-500/60 flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-lg">🔀</span>
                <div>
                  <span className="font-mono text-xs font-bold text-indigo-300 tracking-wider">
                    {whatIfResult.semantic_tag}
                  </span>
                  <p className="text-2xs text-ink">
                    Branched from Step {whatIfResult.branch_step} with: {whatIfResult.label}
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded text-2xs font-mono font-bold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-400/40">
                Alternative Run
              </span>
            </div>

            {/* Side-by-side Score & Metrics Delta */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {/* Score */}
              <div className="p-3 rounded bg-void/80 border border-edge text-center">
                <span className="text-2xs text-muted uppercase block">Mission Score</span>
                <div className="text-lg font-bold text-ink mt-1">
                  {whatIfResult.modified_score} pts
                </div>
                <div
                  className={`text-xs font-mono font-semibold ${
                    whatIfResult.score_delta >= 0 ? "text-ok" : "text-crit"
                  }`}
                >
                  {whatIfResult.score_delta >= 0 ? "+" : ""}
                  {whatIfResult.score_delta} pts
                </div>
              </div>

              {/* Grade */}
              <div className="p-3 rounded bg-void/80 border border-edge text-center">
                <span className="text-2xs text-muted uppercase block">Letter Grade</span>
                <div className="text-lg font-bold text-ink mt-1">
                  {whatIfResult.modified_grade}
                </div>
                <div className="text-xs text-muted font-mono">
                  was {whatIfResult.original_grade}
                </div>
              </div>

              {/* Health */}
              <div className="p-3 rounded bg-void/80 border border-edge text-center">
                <span className="text-2xs text-muted uppercase block">Final Health</span>
                <div className="text-lg font-bold text-ink mt-1">
                  {whatIfResult.modified_health_final.toFixed(1)}%
                </div>
                <div
                  className={`text-xs font-mono font-semibold ${
                    whatIfResult.health_delta >= 0 ? "text-ok" : "text-crit"
                  }`}
                >
                  {whatIfResult.health_delta >= 0 ? "+" : ""}
                  {whatIfResult.health_delta.toFixed(1)}%
                </div>
              </div>

              {/* Downlink */}
              <div className="p-3 rounded bg-void/80 border border-edge text-center">
                <span className="text-2xs text-muted uppercase block">Data Downlink</span>
                <div className="text-lg font-bold text-ink mt-1">
                  {Math.round(whatIfResult.modified_downlink_mb)} MB
                </div>
                <div
                  className={`text-xs font-mono font-semibold ${
                    whatIfResult.downlink_delta >= 0 ? "text-ok" : "text-crit"
                  }`}
                >
                  {whatIfResult.downlink_delta >= 0 ? "+" : ""}
                  {whatIfResult.downlink_delta.toFixed(1)} MB
                </div>
              </div>
            </div>

            {/* Plain-Language Root Cause Explanation */}
            <div className="p-4 rounded-none bg-void/60 border border-edge text-xs">
              <span className="font-semibold text-accent-hi block mb-1">Causal Impact Analysis:</span>
              <p className="text-ink leading-relaxed">{whatIfResult.delta_explanation}</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
