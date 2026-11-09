import type { KidGauge } from "../../lib/kid";

const STATUS_STYLES = {
  good: { bar: "bg-emerald-400", text: "text-emerald-300", glow: "shadow-emerald-400/20" },
  warn: { bar: "bg-amber-400", text: "text-amber-300", glow: "shadow-amber-400/20" },
  bad: { bar: "bg-red-400", text: "text-red-300", glow: "shadow-red-400/30" },
} as const;

const GAUGE_EMOJI: Record<KidGauge["id"], string> = {
  battery: "🔋",
  heat: "🌡️",
  signal: "📡",
  memory: "💾",
  health: "❤️",
};

/**
 * Bottom-left flight HUD: five big kid gauges (Battery, Temperature,
 * Signal, Memory, Ship Health). Status color only — no raw physics numbers.
 */
export function KidGaugeBar({ gauges }: { gauges: KidGauge[] }) {
  if (!gauges.length) {
    return (
      <div className="bg-void/80 backdrop-blur-md rounded-2xl border border-edge px-4 py-3 text-xs text-muted">
        Waiting for telemetry…
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2 max-w-md">
      {gauges.map((g) => {
        const s = STATUS_STYLES[g.status];
        return (
          <div
            key={g.id}
            title={g.line}
            className={`bg-void/80 backdrop-blur-md rounded-2xl border border-edge px-3 py-2 w-[104px] shadow-lg ${s.glow} ${
              g.status === "bad" ? "animate-pulse" : ""
            }`}
          >
            <div className={`text-lg leading-none ${g.status === "bad" ? "animate-bounce" : ""}`}>
              {GAUGE_EMOJI[g.id]}
            </div>
            <div className={`text-[11px] font-bold mt-1 ${s.text}`}>{g.label}</div>
            <div className="h-1.5 rounded-full bg-raised mt-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${s.bar}`}
                style={{ width: `${g.value}%` }}
                role="meter"
                aria-label={g.label}
                aria-valuenow={g.value}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
