import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Rocket, Check, X } from "lucide-react";
import { evaluateDesign, startGame } from "../api/client";
import { loadMissionSession, saveMissionSession, newPlayerId, type MissionSession } from "../lib/mission";
import { missionStory } from "../lib/kid";
import { ShipPreview3D, type ShipArchetype } from "../components/flight/ShipPreview3D";
import type { LiveEngineeringMetrics, SpacecraftDesign } from "../types";

/** Spacecraft bus architectures — balanced for 16+ orbital engineering trade-offs. */
const ARCHETYPES: Array<{
  id: ShipArchetype;
  emoji: string;
  name: string;
  tagline: string;
  specBadge: string;
  battery: Size;
  solar: Size;
  antenna: Size;
}> = [
  {
    id: "scout",
    emoji: "🛰️",
    name: "Lumen-6U Recon Bus",
    tagline: "Balanced Sun-Synchronous platform with 24-TOPS Edge AI NPU.",
    specBadge: "2,000 Wh · 5 m² GaAs · X-Band",
    battery: "M",
    solar: "M",
    antenna: "M",
  },
  {
    id: "tank",
    emoji: "🛡️",
    name: "Sentinel Rad-Hard Bus",
    tagline: "Heavy Li-Sulfur reserve & Whipple shielding for eclipse/CME survival.",
    specBadge: "4,000 Wh · TMR Shielded · 2.5 m² Rad",
    battery: "L",
    solar: "M",
    antenna: "M",
  },
  {
    id: "sprinter",
    emoji: "⚡",
    name: "Hyperion AI Data Center",
    tagline: "High-power dual-wing solar array + Ka-Band / Optical ISL high-rate downlink.",
    specBadge: "8 m² Dual-Wing · 24 TOPS · Ka-Dish",
    battery: "M",
    solar: "L",
    antenna: "L",
  },
];

type Size = "S" | "M" | "L";

/** Configurable subsystem tiers with authentic engineering specifications. */
const PART_SLOTS: Array<{
  id: "battery" | "solar" | "antenna";
  emoji: string;
  label: string;
  options: Record<Size, { id: string; tierName: string; blurb: string }>;
}> = [
  {
    id: "battery",
    emoji: "🔋",
    label: "Energy Storage (Eclipse Reserve)",
    options: {
      S: {
        id: "bat_li_ion_compact_1k",
        tierName: "1.0 kWh Li-Ion",
        blurb: "Low mass (8 kg) — tight 35-min eclipse margin",
      },
      M: {
        id: "bat_li_ion_standard_2k",
        tierName: "2.0 kWh Space Li-Ion",
        blurb: "Nominal 20% DoD reserve across standard LEO umbra",
      },
      L: {
        id: "bat_li_sulfur_heavy_4k",
        tierName: "4.0 kWh Li-Sulfur",
        blurb: "Deep-discharge reserve for continuous SAR & AI compute",
      },
    },
  },
  {
    id: "solar",
    emoji: "☀️",
    label: "Triple-Junction GaAs Solar Array",
    options: {
      S: {
        id: "solar_body_mounted_2m",
        tierName: "2.0 m² Body-Mounted",
        blurb: "180 W peak — compact moment of inertia, slow recharge",
      },
      M: {
        id: "solar_deployable_flat_5m",
        tierName: "5.0 m² Deployable Wing",
        blurb: "450 W peak — supports continuous 24-TOPS AI inference",
      },
      L: {
        id: "solar_articulated_dual_wing_8m",
        tierName: "8.0 m² Sun-Tracking",
        blurb: "720 W peak — rapid SoC recovery & high-load radar ops",
      },
    },
  },
  {
    id: "antenna",
    emoji: "📡",
    label: "RF Downlink & Optical Crosslink Suite",
    options: {
      S: {
        id: "comm_sband_patch",
        tierName: "S-Band Patch (2 Mbps)",
        blurb: "Low power draw (8 W) — suited for compressed AI alerts",
      },
      M: {
        id: "comm_xband_horn",
        tierName: "X-Band Horn + ISL (25 Mbps)",
        blurb: "Balanced RF ground pass + optical relay compatibility",
      },
      L: {
        id: "comm_kaband_steerable_dish",
        tierName: "Ka-Band Gimbal + 10G ISL",
        blurb: "120 Mbps trunk downlink for raw hyperspectral/SAR frames",
      },
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
      launcher_id: "launcher_dedicated_light",
      orbit_id: parts.orbit,
      instrument_ids: [parts.instrument],
      computer_id: "proc_dual_core_space",
      battery_id: findOption("battery", sizeGetter.battery),
      solar_id: findOption("solar", sizeGetter.solar),
      thermal_id: "therm_heatpipe_radiator_2m",
      comms_id: findOption("antenna", sizeGetter.antenna),
      storage_id: "stor_flash_array_256gb",
      shielding_id: "shield_standard_aluminum",
      chassis_dry_mass_kg: 80.0,
      fuel_mass_kg: 25.0,
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
        const playerId = session?.playerId ?? newPlayerId();
        const updatedSession: MissionSession = {
          mode: session?.mode ?? "solo",
          missionId,
          missionName: resp.mission_name ?? session?.missionName ?? missionId,
          spacecraftId: null,
          sessionId: resp.session_id,
          playerId,
          roomCode: null,
          experience: "simple",
        };
        saveMissionSession(updatedSession);
        navigate("/play", { state: { sessionId: resp.session_id, missionId } });
      } catch (err) {
        setError((err as Error).message || "The launchpad is busy — try again!");
        setLaunching(false);
      }
    },
    [missionId, session, design, navigate]
  );

  // Initialize session in storage if arrived directly
  useEffect(() => {
    if (!session) {
      saveMissionSession({
        mode: "solo",
        missionId,
        missionName: missionId,
        spacecraftId: null,
        sessionId: null,
        playerId: newPlayerId(),
        roomCode: null,
        experience: "simple",
      });
    }
  }, [session, missionId]);

  if (!session?.missionId && !searchParams.get("mission")) {
    navigate("/missions", { replace: true });
    return null;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6 border-b border-edge pb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-accent mb-1">
            Orbital AI Spacecraft Integration & Pre-Launch Verification
          </div>
          <h1 className="text-3xl font-bold text-ink">🛠️ Spacecraft Integration Hangar</h1>
          <p className="text-muted mt-1 max-w-3xl text-sm">{missionStory(missionId)}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/design")}
          className="text-xs font-mono text-accent hover:underline cursor-pointer"
        >
          Open Full Component Catalog & Mass/Power CAD →
        </button>
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
                className={`rounded-2xl border-2 p-3 text-left transition-colors cursor-pointer ${
                  archetype === a.id
                    ? "border-accent bg-panel shadow-lg"
                    : "border-edge bg-panel/60 hover:border-edge/80"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{a.emoji}</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-void/70 text-accent border border-edge">
                    {a.id.toUpperCase()}
                  </span>
                </div>
                <div className="text-sm font-bold text-ink mt-1.5">{a.name}</div>
                <div className="text-[10px] font-mono text-accent-hi mt-0.5">{a.specBadge}</div>
                <div className="text-[11px] text-muted mt-1 leading-snug">{a.tagline}</div>
              </button>
            ))}
          </div>

          {/* Fixed Orbital AI Data Center Core Spec Card */}
          <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/15 p-3.5 font-mono text-xs space-y-1.5">
            <div className="flex items-center justify-between text-cyan-300 font-bold">
              <span>🧠 ONBOARD ORBITAL AI DATA CENTER CORE</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/40">
                24 TOPS NPU
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
              <div className="bg-void/60 p-2 rounded border border-edge">
                <span className="text-[9px] text-faint block uppercase">Thermal Loop</span>
                <span className="text-ink font-semibold">2.0 m² Heat-Pipe</span>
              </div>
              <div className="bg-void/60 p-2 rounded border border-edge">
                <span className="text-[9px] text-faint block uppercase">SSDR Storage</span>
                <span className="text-ink font-semibold">256 GB Rad-NVMe</span>
              </div>
              <div className="bg-void/60 p-2 rounded border border-edge">
                <span className="text-[9px] text-faint block uppercase">Optical Crosslink</span>
                <span className="text-cyan-300 font-semibold">1550 nm ISL Ready</span>
              </div>
            </div>
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
                      className={`rounded-xl border px-2.5 py-2 text-left transition-colors cursor-pointer ${
                        selected
                          ? "border-accent bg-panel ring-1 ring-accent/40"
                          : "border-edge bg-panel/40 hover:border-edge/80"
                      }`}
                    >
                      <div className={`text-xs font-mono font-bold ${selected ? "text-accent" : "text-ink"}`}>
                        {slot.options[size].tierName}
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
