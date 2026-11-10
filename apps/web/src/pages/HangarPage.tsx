import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Rocket, Check, X, Cpu, Shield, Zap, Radio, Sliders, ArrowRight } from "lucide-react";
import { evaluateDesign, startGame } from "../api/client";
import { loadMissionSession, saveMissionSession, newPlayerId, type MissionSession } from "../lib/mission";
import { missionStory } from "../lib/kid";
import { ShipPreview3D, type ShipArchetype } from "../components/flight/ShipPreview3D";
import type { LiveEngineeringMetrics, SpacecraftDesign } from "../types";

type Size = "S" | "M" | "L";

/** Spacecraft bus architectures — balanced for 16+ orbital engineering trade-offs. */
const ARCHETYPES: Array<{
  id: ShipArchetype;
  code: string;
  name: string;
  tagline: string;
  specBadge: string;
  radiatorArea: string;
  battery: Size;
  solar: Size;
  antenna: Size;
}> = [
  {
    id: "scout",
    code: "BUS-6U-SSO",
    name: "Lumen-6U Recon Bus",
    tagline: "Balanced Sun-Synchronous platform with 24-TOPS Edge AI NPU & 2x deployable radiator wings.",
    specBadge: "2,000 Wh · 5 m² GaAs · X-Band",
    radiatorArea: "2.0 m² Two-Wing Loop",
    battery: "M",
    solar: "M",
    antenna: "M",
  },
  {
    id: "tank",
    code: "BUS-RAD-TMR",
    name: "Sentinel Rad-Hard Bus",
    tagline: "Heavy Li-Sulfur reserve, 4x thermal radiator wings & Whipple shielding for CME/eclipse survival.",
    specBadge: "4,000 Wh · TMR Shielded · 4-Wing Rad",
    radiatorArea: "3.4 m² Quad-Wing Loop",
    battery: "L",
    solar: "M",
    antenna: "M",
  },
  {
    id: "sprinter",
    code: "BUS-DC-HYPERION",
    name: "Hyperion AI Data Center",
    tagline: "High-power 8 m² quad solar array + Ka-Band gimbal & 10 Gbps 1550 nm Optical ISL mesh.",
    specBadge: "8 m² Quad-Wing · 24 TOPS · Ka-Dish",
    radiatorArea: "4.0 m² Active Louver",
    battery: "M",
    solar: "L",
    antenna: "L",
  },
];

/** Configurable subsystem tiers with authentic engineering specifications. */
const PART_SLOTS: Array<{
  id: "battery" | "solar" | "antenna";
  code: string;
  label: string;
  options: Record<
    Size,
    { id: string; tierName: string; specMetric: string; blurb: string; massKg: number; powerW: number }
  >;
}> = [
  {
    id: "battery",
    code: "EPS-STORAGE",
    label: "Energy Storage (Eclipse Umbra Reserve)",
    options: {
      S: {
        id: "bat_li_ion_compact_1k",
        tierName: "1.0 kWh Space Li-Ion",
        specMetric: "1,000 Wh · 8 kg",
        blurb: "Compact mass envelope — tight 35-min LEO eclipse DoD margin",
        massKg: 8,
        powerW: 0,
      },
      M: {
        id: "bat_li_ion_standard_2k",
        tierName: "2.0 kWh Space Li-Ion",
        specMetric: "2,000 Wh · 15 kg",
        blurb: "Nominal 25% DoD reserve across standard Sun-Synchronous umbra",
        massKg: 15,
        powerW: 0,
      },
      L: {
        id: "bat_li_sulfur_heavy_4k",
        tierName: "4.0 kWh Li-Sulfur Array",
        specMetric: "4,000 Wh · 26 kg",
        blurb: "Deep-discharge reserve for continuous SAR & 24-TOPS AI inference",
        massKg: 26,
        powerW: 0,
      },
    },
  },
  {
    id: "solar",
    code: "EPS-PV-ARRAY",
    label: "Triple-Junction InGaP/GaAs Solar Array",
    options: {
      S: {
        id: "solar_body_mounted_2m",
        tierName: "2.0 m² Compact Wing",
        specMetric: "180 W Peak · 29% Eff",
        blurb: "Low moment of inertia for rapid slew, slower post-eclipse recharge",
        massKg: 6,
        powerW: 180,
      },
      M: {
        id: "solar_deployable_flat_5m",
        tierName: "5.0 m² Deployable Quad",
        specMetric: "450 W Peak · 31% Eff",
        blurb: "Supports continuous 24-TOPS neural compute + payload duty cycle",
        massKg: 14,
        powerW: 450,
      },
      L: {
        id: "solar_articulated_dual_wing_8m",
        tierName: "8.0 m² Sun-Tracking SADA",
        specMetric: "720 W Peak · 32% Eff",
        blurb: "Dual-axis solar gimbal for rapid SoC recovery & high-load radar ops",
        massKg: 22,
        powerW: 720,
      },
    },
  },
  {
    id: "antenna",
    code: "RF-OISL-COMMS",
    label: "RF Downlink & 1550 nm Optical Crosslink Suite",
    options: {
      S: {
        id: "comm_sband_patch",
        tierName: "S-Band Patch (2 Mbps)",
        specMetric: "2 Mbps RF · 8 W Load",
        blurb: "Low power draw — suited for 50:1 AI-compressed GeoJSON vector alerts",
        massKg: 3,
        powerW: 8,
      },
      M: {
        id: "comm_xband_horn",
        tierName: "X-Band Horn + 4G ISL",
        specMetric: "25 Mbps RF · 4 Gbps OISL",
        blurb: "Balanced RF ground pass + optical inter-satellite relay compatibility",
        massKg: 7,
        powerW: 24,
      },
      L: {
        id: "comm_kaband_steerable_dish",
        tierName: "Ka-Band Gimbal + 10G ISL",
        specMetric: "120 Mbps RF · 10 Gbps OISL",
        blurb: "High-gain parabolic gimbal + 4-terminal laser mesh for raw SAR frames",
        massKg: 13,
        powerW: 45,
      },
    },
  },
];

/** Mission-specific orbital regime & AI pipeline specifications. */
const MISSION_PARTS: Record<
  string,
  {
    instrument: string;
    orbit: string;
    title: string;
    orbitSpec: string;
    sensorSpec: string;
    aiModel: string;
    compression: string;
  }
> = {
  wildfire: {
    instrument: "inst_thermal_infrared",
    orbit: "orbit_sso_650",
    title: "Wildfire Scout Theater",
    orbitSpec: "700 km SSO · 98.2° Inclination",
    sensorSpec: "3.9 µm SWIR / 11 µm TIR Radiometer",
    aiModel: "FireNet-SWIR v4.2 (Hotspot CNN)",
    compression: "25:1 GeoJSON Fire Perimeter",
  },
  flood: {
    instrument: "inst_sar_radar",
    orbit: "orbit_sso_650",
    title: "Flood Scout Theater",
    orbitSpec: "620 km SSO · 97.8° Inclination",
    sensorSpec: "5.4 GHz C-Band Dual-Pol SAR Radar",
    aiModel: "HydroMask-SAR v3.8 (U-Net Segmentation)",
    compression: "50:1 Inundation Polygon Vector",
  },
  volcano: {
    instrument: "inst_multispectral_imager",
    orbit: "orbit_leo_400",
    title: "Volcano Watch Theater",
    orbitSpec: "680 km SSO · 98.0° Inclination",
    sensorSpec: "UV SO₂ Spectrometer + InSAR Interferometer",
    aiModel: "PlumeCast-UV/IR v2.9 (Ash Trajectory)",
    compression: "30:1 Aviation SIGMET Advisories",
  },
  solar_storm: {
    instrument: "inst_uv_spectrometer",
    orbit: "orbit_polar_800",
    title: "Solar Storm Sentinel Theater",
    orbitSpec: "800 km Polar · 85.0° Inclination",
    sensorSpec: "EUV Solar Coronagraph & Fluxgate Magnetometer",
    aiModel: "HelioShield-MHD v5.1 (Kp / CME Shock)",
    compression: "12:1 Magnetosphere Alert Stream",
  },
};

interface ReadinessCheck {
  ok: boolean;
  code: string;
  label: string;
  detail: string;
}

export function HangarPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const session = useMemo(() => loadMissionSession(), []);
  const missionId = searchParams.get("mission") ?? session?.missionId ?? "wildfire";

  const [archetype, setArchetype] = useState<ShipArchetype>("scout");
  const [battery, setBattery] = useState<Size>("M");
  const [solar, setSolar] = useState<Size>("M");
  const [antenna, setAntenna] = useState<Size>("M");
  const [metrics, setMetrics] = useState<LiveEngineeringMetrics | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missionMeta = MISSION_PARTS[missionId] ?? MISSION_PARTS.wildfire;
  const activeArchetypeMeta = ARCHETYPES.find((a) => a.id === archetype) ?? ARCHETYPES[0];

  const pickArchetype = (a: (typeof ARCHETYPES)[number]) => {
    setArchetype(a.id);
    setBattery(a.battery);
    setSolar(a.solar);
    setAntenna(a.antenna);
  };

  const sizeGetter: Record<"battery" | "solar" | "antenna", Size> = {
    battery,
    solar,
    antenna,
  };

  const design: SpacecraftDesign = useMemo(() => {
    const parts = MISSION_PARTS[missionId] ?? MISSION_PARTS.wildfire;
    const findOption = (slotId: string, size: Size) =>
      PART_SLOTS.find((s) => s.id === slotId)!.options[size].id;
    return {
      name: `LUMEN-${archetype.toUpperCase()}-${missionId.toUpperCase()}`,
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
  }, [missionId, archetype, battery, solar, antenna]);

  // Derived local physics numbers for instant CAD feedback
  const derivedSpecs = useMemo(() => {
    const batOpt = PART_SLOTS[0].options[battery];
    const solOpt = PART_SLOTS[1].options[solar];
    const antOpt = PART_SLOTS[2].options[antenna];
    const totalWetMassKg = 105 + batOpt.massKg + solOpt.massKg + antOpt.massKg;
    const peakSolarW = solOpt.powerW;
    const nominalLoadW = 145 + antOpt.powerW;
    const netPowerMarginW = peakSolarW - nominalLoadW;
    const eclipseReservePct = battery === "L" ? 78 : battery === "M" ? 56 : 31;
    const thermalRejectionW = archetype === "sprinter" ? 540 : archetype === "tank" ? 460 : 340;
    return {
      totalWetMassKg,
      peakSolarW,
      nominalLoadW,
      netPowerMarginW,
      eclipseReservePct,
      thermalRejectionW,
    };
  }, [archetype, battery, solar, antenna]);

  useEffect(() => {
    const t = setTimeout(() => {
      evaluateDesign(design, 15000)
        .then((m) => setMetrics(m))
        .catch(() => setMetrics(null));
    }, 300);
    return () => clearTimeout(t);
  }, [design]);

  const checks: ReadinessCheck[] = useMemo(() => {
    const massOk = metrics ? metrics.mass_margin_kg > 0 : derivedSpecs.totalWetMassKg <= 180;
    const budgetOk = metrics ? metrics.budget_remaining_credits >= 0 : true;
    const eclipseOk = metrics ? metrics.eclipse_battery_reserve_pct > 20 : derivedSpecs.eclipseReservePct > 25;
    const thermalOk = metrics ? metrics.thermal_margin_pct > 0 : true;
    const suitabilityOk = metrics ? metrics.mission_suitability_pct >= 60 : true;

    return [
      {
        ok: massOk,
        code: "MASS-ENV",
        label: massOk ? "Launch Vehicle Mass Envelope Nominal" : "Launch Mass Exceeded — Reduce Subsystem Tier",
        detail: `${derivedSpecs.totalWetMassKg} kg / 180 kg SSO Fairing Limit`,
      },
      {
        ok: eclipseOk,
        code: "EPS-UMBRA",
        label: eclipseOk ? "Eclipse Umbra Battery Reserve Verified" : "Low Eclipse Reserve — Upgrade Li-Ion/Li-S Storage",
        detail: `${derivedSpecs.eclipseReservePct}% State-of-Charge Floor (35m Umbra)`,
      },
      {
        ok: thermalOk,
        code: "THERM-RAD",
        label: thermalOk ? "Stefan-Boltzmann Radiator Margin Nominal" : "Thermal Saturation Risk — Reduce Compute Duty",
        detail: `${derivedSpecs.thermalRejectionW} W IR Rejection (${activeArchetypeMeta.radiatorArea})`,
      },
      {
        ok: suitabilityOk && budgetOk,
        code: "OISL-LINK",
        label:
          suitabilityOk && budgetOk
            ? "Payload & Optical ISL Architecture Qualified"
            : "Budget or Link Margin Constraint Triggered",
        detail: `${missionMeta.aiModel} · ${missionMeta.compression}`,
      },
    ];
  }, [metrics, derivedSpecs, activeArchetypeMeta.radiatorArea, missionMeta.aiModel, missionMeta.compression]);

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
        console.warn("Hangar launch error, navigating to autonomous session:", err);
        const fallbackSessionId = `s_cadet_${Date.now()}`;
        const playerId = session?.playerId ?? newPlayerId();
        const updatedSession: MissionSession = {
          mode: session?.mode ?? "solo",
          missionId,
          missionName: missionMeta.title,
          spacecraftId: null,
          sessionId: fallbackSessionId,
          playerId,
          roomCode: null,
          experience: "simple",
        };
        saveMissionSession(updatedSession);
        navigate("/play", { state: { sessionId: fallbackSessionId, missionId } });
      }
    },
    [missionId, session, design, navigate]
  );

  useEffect(() => {
    if (!session) {
      saveMissionSession({
        mode: "solo",
        missionId,
        missionName: missionMeta.title,
        spacecraftId: null,
        sessionId: null,
        playerId: newPlayerId(),
        roomCode: null,
        experience: "simple",
      });
    }
  }, [session, missionId, missionMeta.title]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Aerospace Integration Banner */}
      <div className="rounded-2xl border border-slate-800/90 bg-gradient-to-r from-slate-950 via-slate-900/90 to-cyan-950/30 p-5 mb-6 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full border border-cyan-500/40 bg-cyan-500/10 text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-300 mb-2">
              <Sliders className="h-3 w-3" /> Orbital AI Spacecraft Integration & Flight Readiness Review
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
              Spacecraft Integration Hangar — <span className="text-cyan-300">{missionMeta.title}</span>
            </h1>
            <p className="text-muted mt-1 max-w-3xl text-sm leading-relaxed">{missionStory(missionId)}</p>
          </div>

          {/* Quick Theater Switcher + Advanced CAD Link */}
          <div className="flex flex-col items-start sm:items-end gap-2">
            <div className="flex flex-wrap items-center gap-1.5 bg-void/80 p-1 rounded-xl border border-slate-800">
              {(["wildfire", "flood", "volcano", "solar_storm"] as const).map((mId) => {
                const active = missionId === mId;
                const labels: Record<string, string> = {
                  wildfire: "🔥 Wildfire",
                  flood: "🌊 Flood",
                  volcano: "🌋 Volcano",
                  solar_storm: "☀️ Solar Storm",
                };
                return (
                  <button
                    key={mId}
                    type="button"
                    onClick={() => {
                      setSearchParams({ mission: mId });
                      saveMissionSession({
                        mode: session?.mode ?? "solo",
                        missionId: mId,
                        missionName: MISSION_PARTS[mId].title,
                        spacecraftId: null,
                        sessionId: null,
                        playerId: session?.playerId ?? newPlayerId(),
                        roomCode: null,
                        experience: "simple",
                      });
                    }}
                    className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-semibold transition-all cursor-pointer ${
                      active
                        ? "bg-cyan-500/25 text-cyan-200 border border-cyan-400/50 shadow"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {labels[mId]}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => navigate("/design")}
              className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
            >
              Open Full Subsystem CAD & Mass-Power Matrix <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Mission Orbital & Sensor Telemetry Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800/80 font-mono text-xs">
          <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl px-3 py-2">
            <span className="text-[10px] uppercase text-slate-400 block">Target Orbit Regime</span>
            <span className="text-slate-100 font-bold">{missionMeta.orbitSpec}</span>
          </div>
          <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl px-3 py-2">
            <span className="text-[10px] uppercase text-slate-400 block">Primary Sensor Payload</span>
            <span className="text-cyan-300 font-bold">{missionMeta.sensorSpec}</span>
          </div>
          <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl px-3 py-2">
            <span className="text-[10px] uppercase text-slate-400 block">Onboard Edge AI Pipeline</span>
            <span className="text-purple-300 font-bold">{missionMeta.aiModel}</span>
          </div>
          <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl px-3 py-2">
            <span className="text-[10px] uppercase text-slate-400 block">Downlink Compression</span>
            <span className="text-emerald-300 font-bold">{missionMeta.compression}</span>
          </div>
        </div>
      </div>

      {/* Main Two-Column Aerospace Cleanroom Layout */}
      <div className="grid lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Interactive 3D Orbital AI Satellite Cleanroom + Spacecraft Bus Selector */}
        <div className="lg:col-span-7 space-y-5">
          <ShipPreview3D
            archetype={archetype}
            batterySize={battery}
            solarSize={solar}
            antennaSize={antenna}
            className="w-full h-[380px] sm:h-[420px]"
          />

          {/* Live Spacecraft Bus Engineering Telemetry Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
              <div className="text-[10px] uppercase text-slate-400">Total Wet Mass</div>
              <div className="text-base font-bold text-slate-100 mt-0.5">{derivedSpecs.totalWetMassKg} kg</div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                <div
                  className="h-full bg-cyan-400 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (derivedSpecs.totalWetMassKg / 180) * 100)}%` }}
                />
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
              <div className="text-[10px] uppercase text-slate-400">Peak Solar Array</div>
              <div className="text-base font-bold text-amber-300 mt-0.5">{derivedSpecs.peakSolarW} W</div>
              <div className="text-[10px] text-emerald-400 mt-1">
                +{derivedSpecs.netPowerMarginW} W Net Daylight
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
              <div className="text-[10px] uppercase text-slate-400">Eclipse Reserve</div>
              <div className="text-base font-bold text-emerald-300 mt-0.5">
                {derivedSpecs.eclipseReservePct}% SoC
              </div>
              <div className="text-[10px] text-slate-400 mt-1">35m Umbra Survival</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
              <div className="text-[10px] uppercase text-slate-400">Radiator Rejection</div>
              <div className="text-base font-bold text-cyan-300 mt-0.5">
                {derivedSpecs.thermalRejectionW} W
              </div>
              <div className="text-[10px] text-slate-400 mt-1">{activeArchetypeMeta.radiatorArea}</div>
            </div>
          </div>

          {/* 3 Spacecraft Bus Architectures */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="font-mono text-xs uppercase tracking-wider text-slate-300 font-bold">
                1. Select Orbital Spacecraft Bus Architecture
              </span>
              <span className="font-mono text-[11px] text-cyan-400">
                Updates 3D Cleanroom Geometry Live
              </span>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              {ARCHETYPES.map((a) => {
                const selected = archetype === a.id;
                const Icon = a.id === "scout" ? Cpu : a.id === "tank" ? Shield : Zap;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => pickArchetype(a)}
                    className={`rounded-2xl border p-4 text-left transition-all cursor-pointer flex flex-col justify-between ${
                      selected
                        ? "border-cyan-400 bg-gradient-to-b from-cyan-950/50 to-slate-950 shadow-[0_0_25px_rgba(34,211,238,0.15)]"
                        : "border-slate-800 bg-slate-950/70 hover:border-slate-700"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`p-2 rounded-lg border ${
                            selected
                              ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-300"
                              : "border-slate-800 bg-slate-900 text-slate-400"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-cyan-300 border border-slate-800">
                          {a.code}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-slate-100 mt-3">{a.name}</div>
                      <div className="text-[10px] font-mono text-amber-300 mt-0.5">{a.specBadge}</div>
                      <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{a.tagline}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Subsystem Configuration + Flight Readiness Review (FRR) + Launch */}
        <div className="lg:col-span-5 space-y-4">
          <div className="font-mono text-xs uppercase tracking-wider text-slate-300 font-bold">
            2. Configure Modular Spacecraft Subsystems
          </div>

          {PART_SLOTS.map((slot) => (
            <div
              key={slot.id}
              className="rounded-2xl border border-slate-800/90 bg-slate-950/80 p-4 shadow-lg"
            >
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-sm font-bold text-slate-100">{slot.label}</span>
                <span className="font-mono text-[10px] text-cyan-400 px-2 py-0.5 rounded bg-cyan-950/50 border border-cyan-500/30">
                  {slot.code}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {(["S", "M", "L"] as Size[]).map((size) => {
                  const selected = sizeGetter[slot.id] === size;
                  const opt = slot.options[size];
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
                      className={`rounded-xl border p-2.5 text-left transition-all cursor-pointer flex flex-col justify-between ${
                        selected
                          ? "border-cyan-400 bg-cyan-950/40 ring-1 ring-cyan-400/40"
                          : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
                      }`}
                    >
                      <div>
                        <div
                          className={`text-xs font-mono font-bold ${
                            selected ? "text-cyan-300" : "text-slate-200"
                          }`}
                        >
                          {opt.tierName}
                        </div>
                        <div className="text-[10px] font-mono text-amber-300/90 mt-0.5">
                          {opt.specMetric}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1 leading-snug">
                          {opt.blurb}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Flight Readiness Review (FRR) Telemetry Matrix */}
          <div className="rounded-2xl border border-slate-800/90 bg-slate-950/90 p-4 shadow-lg">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
                  Flight Readiness Review (FRR) Telemetry
                </span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                24 TOPS NPU READY
              </span>
            </div>

            <ul className="space-y-2" aria-label="Engineering checks">
              {checks.map((c) => (
                <li
                  key={c.code}
                  className="flex items-start justify-between gap-3 rounded-xl bg-slate-900/70 border border-slate-800/80 px-3 py-2 text-xs"
                >
                  <div className="flex items-start gap-2">
                    {c.ok ? (
                      <Check size={15} className="text-emerald-400 shrink-0 mt-0.5" aria-hidden />
                    ) : (
                      <X size={15} className="text-red-400 shrink-0 mt-0.5" aria-hidden />
                    )}
                    <div>
                      <div className={c.ok ? "text-slate-200 font-medium" : "text-amber-200 font-medium"}>
                        {c.label}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">{c.detail}</div>
                    </div>
                  </div>
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                      c.ok
                        ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                        : "bg-red-500/15 text-red-300 border border-red-500/30"
                    }`}
                  >
                    {c.ok ? "NOMINAL" : "WARN"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {error && (
            <div className="rounded-xl border border-red-400/40 bg-red-950/40 px-3.5 py-2.5 text-xs font-mono text-red-200">
              {error}
            </div>
          )}

          {/* Aerospace Launch Sequence Controls */}
          <div className="pt-1 flex flex-col gap-2.5">
            <button
              type="button"
              disabled={launching}
              onClick={() => void launch(true)}
              className="flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 text-slate-950 font-mono font-bold text-sm uppercase tracking-wider py-4 px-6 shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all cursor-pointer"
            >
              <Rocket size={18} aria-hidden />
              {launching ? "INITIALIZING ORBITAL INJECTION…" : "INITIATE ORBITAL LAUNCH SEQUENCE"}
            </button>
            <button
              type="button"
              disabled={launching}
              onClick={() => void launch(false)}
              className="text-xs font-mono text-slate-400 hover:text-cyan-300 py-1.5 transition-colors cursor-pointer"
            >
              Bypass Custom CAD — Deploy Recommended Baseline Spacecraft →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
