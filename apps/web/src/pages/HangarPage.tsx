import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Rocket, Check, X } from "lucide-react";
import { evaluateDesign, startGame } from "../api/client";
import { loadMissionSession, saveMissionSession } from "../lib/mission";
import { missionStory } from "../lib/kid";
import { ShipPreview3D, type ShipArchetype } from "../components/flight/ShipPreview3D";
import type { LiveEngineeringMetrics, SpacecraftDesign } from "../types";

/** Ship archetypes — plain-language personalities, no physics numbers. */
const ARCHETYPES: Array<{
  id: ShipArchetype;
  emoji: string;
  name: string;
  tagline: string;
  battery: Size;
  solar: Size;
  antenna: Size;
}> = [
  {
    id: "scout",
    emoji: "🛰️",
    name: "The Scout",
    tagline: "Balanced and friendly — great first ship.",
    battery: "M",
    solar: "M",
    antenna: "M",
  },
  {
    id: "tank",
    emoji: "🛡️",
    name: "The Tank",
    tagline: "Big battery and tough parts — hard to break.",
    battery: "L",
    solar: "M",
    antenna: "M",
  },
  {
    id: "sprinter",
    emoji: "⚡",
    name: "The Sprinter",
    tagline: "Huge solar wings — loves the sunshine.",
    battery: "M",
    solar: "L",
    antenna: "M",
  },
];

type Size = "S" | "M" | "L";

/** The three kid-editable part slots. */
const PART_SLOTS: Array<{
  id: "battery" | "solar" | "antenna";
  emoji: string;
  label: string;
  options: Record<Size, { id: string; blurb: string }>;
}> = [
  {
    id: "battery",
    emoji: "🔋",
    label: "Battery",
    options: {
      S: { id: "bat_li_ion_compact_1k", blurb: "Small — light, but nights are scary" },
      M: { id: "bat_li_ion_standard_2k", blurb: "Medium — good for most nights" },
      L: { id: "bat_li_sulfur_heavy_4k", blurb: "Big — survives the longest nights" },
    },
  },
  {
    id: "solar",
    emoji: "☀️",
    label: "Solar Wings",
    options: {
      S: { id: "solar_body_mounted_2m", blurb: "Small — charges slowly in sunlight" },
      M: { id: "solar_deployable_flat_5m", blurb: "Medium — solid sunshine power" },
      L: { id: "solar_articulated_dual_wing_8m", blurb: "Big — drinks up the sunshine fast" },
    },
  },
  {
    id: "antenna",
    emoji: "📡",
    label: "Antenna",
    options: {
      S: { id: "comm_sband_patch", blurb: "Small — sends data home slowly" },
      M: { id: "comm_xband_horn", blurb: "Medium — sends photos home nicely" },
      L: { id: "comm_kaband_steerable_dish", blurb: "Big — beams data home super fast" },
    },
  },
];

/** Mission-specific parts the hangar picks automatically (no kid choice). */
const MISSION_PARTS: Record<string, { instrument: string; orbit: string }> = {
  wildfire: { instrument: "inst_thermal_infrared", orbit: "orbit_sso_650" },
  flood: { instrument: "inst_sar_radar", orbit: "orbit_sso_650" },
  solar_storm: { instrument: "inst_uv_spectrometer", orbit: "orbit_polar_800" },
  volcano: { instrument: "inst_multispectral_imager", orbit: "orbit_leo_400" },
};

interface Check {
  ok: boolean;
  label: string;
}

/**
 * Spacecraft Hangar — the kid-friendly pre-flight build screen.
 * Pick a ship personality, tweak three part sizes with plain-language
 * trade-offs, see friendly checkmarks (no physics numbers), and launch.
 */
export function HangarPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const session = useMemo(() => loadMissionSession(), []);
  const missionId = session?.missionId ?? searchParams.get("mission") ?? "wildfire";

  const [archetype, setArchetype] = useState<ShipArchetype>("scout");
  const [battery, setBattery] = useState<Size>("M");
  const [solar, setSolar] = useState<Size>("M");
  const [antenna, setAntenna] = useState<Size>("M");
  const [metrics, setMetrics] = useState<LiveEngineeringMetrics | null>(null);
  const [_metricsUpToDate, setMetricsUpToDate] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Archetype presets the part sizes when picked
  const pickArchetype = (a: (typeof ARCHETYPES)[number]) => {
    setArchetype(a.id);
    setBattery(a.battery);
    setSolar(a.solar);
    setAntenna(a.antenna);
  };

  const sizeGetter = {
    battery,
    solar,
    antenna,
  } as Record<"battery" | "solar" | "antenna", Size>;

  const design: SpacecraftDesign = useMemo(() => {
    const parts = MISSION_PARTS[missionId] ?? MISSION_PARTS.wildfire;
    const findOption = (slotId: string, size: Size) =>
      PART_SLOTS.find((s) => s.id === slotId)!.options[size].id;
    return {
      name: `Cadet ${missionId} ship`,
      mission_id: missionId,
      launcher_id: "launcher_smallsat_rideshare",
      orbit_id: parts.orbit,
      instrument_ids: [parts.instrument],
      computer_id: "proc_dual_core_space",
      battery_id: findOption("battery", sizeGetter.battery),
      solar_id: findOption("solar", sizeGetter.solar),
      thermal_id: "therm_heatpipe_radiator_2m",
      comms_id: findOption("antenna", sizeGetter.antenna),
      storage_id: "stor_flash_array_256gb",
      shielding_id: "shield_standard_aluminum",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId, battery, solar, antenna]);

  // Friendly engineering checkmarks (debounced evaluate; silent when offline)
  useEffect(() => {
    setMetricsUpToDate(false);
    const t = setTimeout(() => {
      evaluateDesign(design, 15000)
        .then((m) => {
          setMetrics(m);
          setMetricsUpToDate(true);
        })
        .catch(() => setMetrics(null));
    }, 350);
    return () => clearTimeout(t);
  }, [design]);

  const checks: Check[] = useMemo(() => {
    if (!metrics) {
      // Offline / backend down — assume the recommended kit is fine
      return [{ ok: true, label: "Using the recommended ship kit" }];
    }
    return [
      {
        ok: metrics.mass_margin_kg > 0,
        label: metrics.mass_margin_kg > 0 ? "Light enough to launch ✓" : "Too heavy — make some parts smaller",
      },
      {
        ok: metrics.budget_remaining_credits >= 0,
        label:
          metrics.budget_remaining_credits >= 0
            ? "Fits your coin budget ✓"
            : "Costs too many coins — pick smaller parts",
      },
      {
        ok: metrics.eclipse_battery_reserve_pct > 20,
        label:
          metrics.eclipse_battery_reserve_pct > 20
            ? "Survives the night ✓"
            : "Battery might not last the night — get a bigger battery",
      },
      {
        ok: metrics.thermal_margin_pct > 0,
        label: metrics.thermal_margin_pct > 0 ? "Stays cool enough ✓" : "Might get too hot",
      },
      {
        ok: metrics.mission_suitability_pct >= 60,
        label:
          metrics.mission_suitability_pct >= 60
            ? "Perfect for this mission ✓"
            : "Could be better for this mission",
      },
    ];
  }, [metrics]);

  const launch = useCallback(
    async (withDesign: boolean) => {
      setLaunching(true);
      setError(null);
      try {
        const resp = await startGame({
          mission_id: missionId,
          player_ids: [session?.playerId ?? "cadet"],
          difficulty: "cadet",
          ...(withDesign ? { design } : {}),
        });
        if (session) {
          saveMissionSession({
            ...session,
            sessionId: resp.session_id,
            missionName: resp.mission_name ?? session.missionName,
            experience: "simple",
          });
        }
        navigate("/play");
      } catch (err) {
        setError((err as Error).message || "The launchpad is busy — try again!");
        setLaunching(false);
      }
    },
    [missionId, session, design, navigate]
  );

  if (!session?.missionId && !searchParams.get("mission")) {
    navigate("/missions", { replace: true });
    return null;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-ink">🛠️ The Spacecraft Hangar</h1>
        <p className="text-muted mt-1">{missionStory(missionId)}</p>
        <p className="text-sm text-faint mt-1">
          Pick a ship and some parts, then press LAUNCH. The engineers' report does the math for you.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: 3D preview + archetype picker */}
        <div className="space-y-4">
          <ShipPreview3D archetype={archetype} className="w-full h-72" />

          <div className="grid grid-cols-3 gap-3">
            {ARCHETYPES.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => pickArchetype(a)}
                className={`rounded-2xl border-2 p-3 text-left transition-colors ${
                  archetype === a.id
                    ? "border-accent bg-panel shadow-lg"
                    : "border-edge bg-panel/60 hover:border-edge/80"
                }`}
              >
                <div className="text-2xl">{a.emoji}</div>
                <div className="text-sm font-bold text-ink mt-1">{a.name}</div>
                <div className="text-[11px] text-muted mt-0.5 leading-snug">{a.tagline}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: part slots + checks + launch */}
        <div className="space-y-4">
          {PART_SLOTS.map((slot) => (
            <div key={slot.id} className="rounded-2xl border border-edge bg-panel/60 p-3">
              <div className="text-sm font-bold text-ink mb-2">
                {slot.emoji} {slot.label}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(["S", "M", "L"] as Size[]).map((size) => {
                  const selected = sizeGetter[slot.id] === size;
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() =>
                        slot.id === "battery"
                          ? setBattery(size)
                          : slot.id === "solar"
                            ? setSolar(size)
                            : setAntenna(size)
                      }
                      className={`rounded-xl border px-2 py-2 text-center transition-colors ${
                        selected
                          ? "border-accent bg-panel"
                          : "border-edge bg-panel/40 hover:border-edge/80"
                      }`}
                    >
                      <div className={`text-sm font-bold ${selected ? "text-accent" : "text-ink"}`}>
                        {size === "S" ? "Small" : size === "M" ? "Medium" : "Big"}
                      </div>
                      <div className="text-[10px] text-muted mt-0.5 leading-tight">
                        {slot.options[size].blurb}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Engineers' friendly checkmarks */}
          <div className="rounded-2xl border border-edge bg-panel/60 p-3">
            <div className="text-sm font-bold text-ink mb-2">Engineers' report</div>
            <ul className="space-y-1.5" aria-label="Engineering checks">
              {checks.map((c) => (
                <li key={c.label} className="flex items-center gap-2 text-sm">
                  {c.ok ? (
                    <Check size={15} className="text-emerald-400 shrink-0" aria-hidden />
                  ) : (
                    <X size={15} className="text-red-400 shrink-0" aria-hidden />
                  )}
                  <span className={c.ok ? "text-muted" : "text-amber-200"}>{c.label.replace(/ [✓]$/, "")}</span>
                </li>
              ))}
            </ul>
          </div>

          {error && (
            <div className="rounded-xl border border-red-400/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={launching}
              onClick={() => void launch(true)}
              className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 text-ink font-bold text-lg py-3 transition-colors"
            >
              <Rocket size={22} aria-hidden />
              {launching ? "Counting down…" : "LAUNCH! 🚀"}
            </button>
            <button
              type="button"
              disabled={launching}
              onClick={() => void launch(false)}
              className="text-sm text-muted hover:text-ink underline"
            >
              Skip — use the recommended ship
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
