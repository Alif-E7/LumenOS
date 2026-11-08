import { useState, useCallback, useEffect } from "react";
import type { ClockState } from "../types";
import { Button } from "./Button";
import { Play, Pause, Save, RotateCcw, FastForward } from "lucide-react";

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
      className={`relative overflow-hidden border border-edge bg-panel p-3 flex flex-wrap items-center justify-between gap-4 ${className}`}
      role="region"
      aria-label="Simulation Mission Clock Controls"
 >
      {/* Running sweep */}
      {isRunning && !disabled && (
 <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-1/4 animate-sweep bg-gradient-to-r from-transparent via-accent/[0.05] to-transparent"
        />
 )}

      {/* Clock display */}
 <div className="flex items-center gap-3">
 <span
          className={`h-2 w-2 ${isRunning ? "bg-ok glow-accent animate-pulse-soft" : "bg-warn"}`}
          aria-hidden="true"
        />
 <span
          className={`data-readout text-xl font-semibold tracking-wide ${
            isRunning ? "text-ink text-glow" : "text-muted"
          }`}
 >
          {formatMET(elapsed)}
 </span>
 <span
          className={`border px-2 py-0.5 micro-label ${
            isRunning ? "border-ok/30 bg-ok/10 text-ok" : "border-warn/30 bg-warn/10 text-warn"
          }`}
 >
          {clock?.status ?? "RUNNING"}
 </span>
        {isCoop && (
 <span className="border border-info/30 bg-info/10 px-2 py-0.5 micro-label text-info">
            SHARED CLOCK
 </span>
 )}
 </div>

      {/* Transport controls */}
 <div className="flex flex-wrap items-center gap-2">
 <Button
          size="sm"
          variant={isRunning ? "secondary" : "primary"}
          onClick={isRunning ? onPause : onResume}
          disabled={disabled}
          title="Toggle Simulation Play/Pause (Shortcut: Space)"
 >
          {isRunning ? (
 <>
 <Pause className="h-3.5 w-3.5" aria-hidden /> Pause
 </>
 ) : (
 <>
 <Play className="h-3.5 w-3.5" aria-hidden /> Resume
 </>
 )}
 </Button>

 <Button size="sm" variant="secondary" onClick={() => onStep?.(1)} disabled={disabled} title="Advance simulation by 1 step (60s)">
          +1m
 </Button>
 <Button size="sm" variant="secondary" onClick={() => onStep?.(5)} disabled={disabled} title="Advance simulation by 5 steps (5m)">
          +5m
 </Button>

        {/* Speed multipliers */}
 <div className="flex items-center border border-edge bg-void p-0.5" role="group" aria-label="Time compression">
          {speeds.map((s) => (
 <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => onSetSpeed?.(s)}
              className={`px-2 py-1 data-readout text-[11px] font-medium transition-colors ${
                speed === s ? "bg-accent/15 text-accent" : "text-faint hover:text-ink"
              }`}
              aria-pressed={speed === s}
 >
              {s}x
 </button>
 ))}
 </div>
 </div>

      {/* Event jump & checkpoints */}
 <div className="flex flex-wrap items-center gap-2">
 <div className="flex items-center gap-1.5">
 <select
            value={selectedJump}
            onChange={(e) => setSelectedJump(e.target.value)}
            disabled={disabled}
            className="border border-edge bg-void px-2 py-1.5 font-mono text-xs text-ink focus:border-accent focus:outline-none"
            aria-label="Select orbital event to jump to"
 >
 <option value="SUNSET">Next Sunset (Umbra Ingress)</option>
 <option value="SUNRISE">Next Sunrise (Sunlight)</option>
 <option value="GROUND_STATION_AOS">Next Station AOS (Comms)</option>
 <option value="OBSERVATION_OPPORTUNITY_AOS">Next Target Pass</option>
 </select>
 <Button size="sm" variant="secondary" onClick={handleJumpExecute} disabled={disabled} title="Fast forward simulation to next occurrence of selected event">
 <FastForward className="h-3.5 w-3.5" aria-hidden /> Jump
 </Button>
 </div>

 <div className="flex items-center gap-1">
 <Button size="sm" variant="ghost" onClick={onSaveCheckpoint} disabled={disabled} title="Save current simulation snapshot to browser checkpoint storage">
 <Save className="h-3.5 w-3.5" aria-hidden /> Save
 </Button>
 <Button size="sm" variant="ghost" onClick={onRestoreCheckpoint} disabled={disabled} title="Restore last saved checkpoint snapshot">
 <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restore
 </Button>
 </div>
 </div>
 </div>
 );
}
