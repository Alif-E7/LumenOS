import { useState, useCallback, useEffect } from "react";
import type { ClockState } from "../types";
import { Button } from "./Button";

export interface MissionClockBarProps {
  clock?: ClockState | null;
  onPause?: () => void;
  onResume?: () => void;
  onSetSpeed?: (multiplier: number) => void;
  onStep?: (numSteps: number) => void;
  onFastForward?: (params: { target_seconds?: number; event_type?: string }) => void;
  onSaveCheckpoint?: () => void;
  onRestoreCheckpoint?: () => void;
  disabled?: boolean;
  isCoop?: boolean;
  className?: string;
}

function formatMET(elapsedSeconds: number): string {
  const h = Math.floor(elapsedSeconds / 3600);
  const m = Math.floor((elapsedSeconds % 3600) / 60);
  const s = Math.floor(elapsedSeconds % 60);
  return `T+${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Authoritative Mission Clock Bar.
 * Synchronizes with simulation runtime clock, controls playback rate,
 * allows single-stepping, event jumping, and checkpoint management.
 */
export function MissionClockBar({
  clock,
  onPause,
  onResume,
  onSetSpeed,
  onStep,
  onFastForward,
  onSaveCheckpoint,
  onRestoreCheckpoint,
  disabled = false,
  isCoop = false,
  className = "",
}: MissionClockBarProps) {
  const [selectedJump, setSelectedJump] = useState<string>("SUNSET");
  const elapsed = clock?.elapsed_seconds ?? 0;
  const isRunning = clock?.status === "RUNNING";
  const speed = clock?.speed_multiplier ?? 1.0;

  // Keyboard shortcut: Spacebar toggles Play/Pause if not inside an input
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        if (isRunning) onPause?.();
        else onResume?.();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRunning, onPause, onResume]);

  const speeds = [1, 2, 5, 10, 30];

  const handleJumpExecute = useCallback(() => {
    if (!onFastForward) return;
    onFastForward({ event_type: selectedJump });
  }, [onFastForward, selectedJump]);

  return (
    <div
      className={`rounded-xl border border-slate-800 bg-slate-900/80 backdrop-blur-md p-3 flex flex-wrap items-center justify-between gap-4 ${className}`}
      role="region"
      aria-label="Simulation Mission Clock Controls"
    >
      {/* Clock Display & Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`w-3 h-3 rounded-full ${
              isRunning ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
            }`}
            aria-hidden="true"
          />
          <span className="text-xl font-mono font-bold text-white tracking-wider">
            {formatMET(elapsed)}
          </span>
        </div>
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase border ${
            isRunning
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-amber-500/10 border-amber-500/30 text-amber-300"
          }`}
        >
          {clock?.status ?? "RUNNING"}
        </span>
        {isCoop && (
          <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 rounded-full">
            SHARED CO-OP CLOCK
          </span>
        )}
      </div>

      {/* Playback Controls & Speed Multipliers */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Play / Pause */}
        <Button
          size="sm"
          variant={isRunning ? "secondary" : "primary"}
          onClick={isRunning ? onPause : onResume}
          disabled={disabled}
          title="Toggle Simulation Play/Pause (Shortcut: Space)"
        >
          {isRunning ? "❚❚ Pause" : "▶ Resume"}
        </Button>

        {/* Step Forward Buttons */}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onStep?.(1)}
          disabled={disabled}
          title="Advance simulation by 1 step (60s)"
        >
          +1m
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onStep?.(5)}
          disabled={disabled}
          title="Advance simulation by 5 steps (5m)"
        >
          +5m
        </Button>

        {/* Speed Buttons */}
        <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 p-0.5">
          {speeds.map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => onSetSpeed?.(s)}
              className={`px-2 py-1 text-xs font-mono font-semibold rounded transition-colors ${
                speed === s
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Event Jump & Checkpoints */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Event Jump Dropdown */}
        <div className="flex items-center gap-1.5">
          <select
            value={selectedJump}
            onChange={(e) => setSelectedJump(e.target.value)}
            disabled={disabled}
            className="text-xs font-mono bg-slate-950 border border-slate-800 text-slate-300 rounded px-2 py-1.5 focus:border-blue-500 focus:outline-none"
            aria-label="Select orbital event to jump to"
          >
            <option value="SUNSET">Next Sunset (Umbra Ingress)</option>
            <option value="SUNRISE">Next Sunrise (Sunlight)</option>
            <option value="GROUND_STATION_AOS">Next Station AOS (Comms)</option>
            <option value="OBSERVATION_OPPORTUNITY_AOS">Next Target Pass</option>
          </select>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleJumpExecute}
            disabled={disabled}
            title="Fast forward simulation to next occurrence of selected event"
          >
            Jump ⏭
          </Button>
        </div>

        {/* Checkpoint Buttons */}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={onSaveCheckpoint}
            disabled={disabled}
            title="Save current simulation snapshot to browser checkpoint storage"
          >
            💾 Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRestoreCheckpoint}
            disabled={disabled}
            title="Restore last saved checkpoint snapshot"
          >
            ↺ Restore
          </Button>
        </div>
      </div>
    </div>
  );
}
