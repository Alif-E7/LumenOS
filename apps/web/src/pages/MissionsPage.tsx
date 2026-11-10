import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { listMissions } from "../api/client";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { StatusBadge } from "../components/StatusBadge";
import { missionIcon } from "../lib/constants";
import { missionStory } from "../lib/kid";
import { saveMissionSession, newPlayerId } from "../lib/mission";
import { GraduationCap, TriangleAlert, ArrowRight, Rocket, Sliders, Cpu, Radio } from "lucide-react";
import type { MissionBrief } from "../types";

const severityVariant = (difficulty: number) => {
  if (difficulty <= 2) return "success" as const;
  if (difficulty <= 3) return "warning" as const;
  return "danger" as const;
};

/** Rich aerospace metadata per mission theater so no raw internal IDs (e.g. inst_sar_radar) appear. */
const MISSION_THEATER_META: Record<
  string,
  {
    sensorDisplay: string;
    aiPipeline: string;
    phenomenology: string;
    gradientClass: string;
    borderAccent: string;
    badgeText: string;
    badgeColor: string;
  }
> = {
  wildfire: {
    sensorDisplay: "3.9 µm SWIR / TIR",
    aiPipeline: "FireNet-SWIR v4.2 (25:1)",
    phenomenology: "Anisotropic Flame Fronts · Pyrocumulus Plumes · Burn-Scar Coal Veins",
    gradientClass: "from-orange-950/60 via-slate-950 to-slate-950",
    borderAccent: "hover:border-orange-500/60",
    badgeText: "SWIR THERMAL INFRARED",
    badgeColor: "text-orange-300 border-orange-500/40 bg-orange-500/10",
  },
  flood: {
    sensorDisplay: "5.4 GHz C-Band SAR",
    aiPipeline: "HydroMask-SAR v3.8 (50:1)",
    phenomenology: "Topographic Valley Inundation · Specular Flood Channels · Monsoon Anvil",
    gradientClass: "from-cyan-950/60 via-slate-950 to-slate-950",
    borderAccent: "hover:border-cyan-500/60",
    badgeText: "SYNTHETIC APERTURE RADAR",
    badgeColor: "text-cyan-300 border-cyan-500/40 bg-cyan-500/10",
  },
  volcano: {
    sensorDisplay: "UV SO₂ + InSAR Radar",
    aiPipeline: "PlumeCast-UV/IR v2.9 (30:1)",
    phenomenology: "3D Stratovolcano Relief · 5 Dendritic Lava Channels · Plinian Ash Umbrella",
    gradientClass: "from-fuchsia-950/55 via-slate-950 to-slate-950",
    borderAccent: "hover:border-fuchsia-500/60",
    badgeText: "MULTISPECTRAL UV / INSAR",
    badgeColor: "text-fuchsia-300 border-fuchsia-500/40 bg-fuchsia-500/10",
  },
  solar_storm: {
    sensorDisplay: "EUV Coronagraph + MHD",
    aiPipeline: "HelioShield-MHD v5.1 (12:1)",
    phenomenology: "Sun-to-Earth CME Plasma Cloud · 3D Dipolar Magnetosphere · Polar Auroral Curtains",
    gradientClass: "from-emerald-950/55 via-slate-950 to-slate-950",
    borderAccent: "hover:border-emerald-500/60",
    badgeText: "HELIOSPHERIC SPACE WEATHER",
    badgeColor: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
  },
};

/** 5-Bar Aerospace Threat & Telemetry Complexity Meter (replaces cartoon emoji stars). */
function ThreatComplexityMeter({ level }: { level: number }) {
  return (
    <div
      className="inline-flex items-center gap-2 font-mono text-[10px]"
      aria-label={`Difficulty ${level} of 5`}
      role="img"
    >
      <span className="uppercase tracking-wider text-slate-400">Complexity</span>
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }, (_, i) => {
          const active = i < level;
          const barColor =
            level <= 2
              ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
              : level <= 3
              ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]"
              : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]";
          return (
            <span
              key={i}
              className={`h-2.5 w-3.5 rounded-sm transition-all ${
                active ? barColor : "bg-slate-800"
              }`}
              aria-hidden
            />
          );
        })}
      </div>
    </div>
  );
}

export function MissionsPage() {
  const navigate = useNavigate();
  const { data: missions, loading, error } = useApi(listMissions);

  const startFlight = (mId: string, mName: string, directToPlay = false) => {
    saveMissionSession({
      mode: "solo",
      missionId: mId,
      missionName: mName,
      spacecraftId: null,
      sessionId: null,
      playerId: newPlayerId(),
      roomCode: null,
      experience: "simple",
    });
    if (directToPlay) {
      navigate("/play", { state: { missionId: mId } });
    } else {
      navigate(`/hangar?mission=${mId}`);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 pb-16 sm:px-6 lg:px-8">
      {/* Modern Aerospace Command Header */}
      <div className="rounded-2xl border border-slate-800/90 bg-gradient-to-r from-slate-950 via-slate-900/90 to-cyan-950/30 p-6 sm:p-8 shadow-2xl mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/40 bg-cyan-500/10 text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-300 mb-3">
              <Radio className="h-3 w-3 animate-pulse" /> Orbital Crisis Response Campaign · 4 Active Global Theaters
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-ink tracking-tight">
              Where will you fly today?
            </h1>
            <p className="mt-2 max-w-3xl text-sm sm:text-base text-slate-300 leading-relaxed">
              Select a global Earth-monitoring or space-weather theater, customize your Orbital AI Data
              Center spacecraft in the cleanroom hangar, or launch directly into the 3D orbital simulation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => navigate("/globe")}
              className="px-4 py-2.5 rounded-xl border border-cyan-500/40 bg-cyan-950/40 hover:bg-cyan-900/50 text-xs font-mono font-bold text-cyan-200 transition-all cursor-pointer"
            >
              🌍 Live 3D Constellation Globe
            </button>
            <button
              type="button"
              onClick={() => navigate("/coop")}
              className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-xs font-mono font-bold text-slate-200 transition-all cursor-pointer"
            >
              👥 Co-Op Crew Lobby
            </button>
          </div>
        </div>
      </div>

      {/* Onboarding Primer Banner */}
      <div className="rounded-2xl mb-8 border border-amber-500/35 bg-gradient-to-r from-amber-950/30 via-slate-950 to-slate-950 p-5 shadow-lg">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-amber-400" aria-hidden />
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-300 font-bold">
                Recommended First Sortie · Orbital Mechanics & Edge AI Primer
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-100">
              Sunrise Orbit — Sun-Synchronous Duty Cycles & 24-TOPS Onboard Inference
            </h2>
            <p className="mt-1 max-w-2xl text-xs sm:text-sm text-slate-300 leading-relaxed">
              Master Sun-Synchronous Orbit (SSO) solar/eclipse power transitions, Stefan-Boltzmann thermal
              radiator rejection, and 3-stage `[E] Scan` → `[R] Edge AI` → `[F] Optical ISL Beam` containment.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 self-start md:self-center">
            <Button size="sm" variant="secondary" onClick={() => navigate("/help")}>
              Systems Manual
            </Button>
            <Button size="sm" onClick={() => startFlight("wildfire", "Wildfire Scout", true)}>
              Launch Wildfire Theater <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="py-16 text-center">
          <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-t-2 border-cyan-400" />
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-slate-400">
            Synchronizing Orbital Mission Catalog…
          </p>
        </div>
      )}

      {error && missions && missions.length > 0 && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <div className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4" aria-hidden />
            <span>Telemetry API in standalone mode — running local physics & mission catalog.</span>
          </div>
          <span className="font-mono text-[10px] uppercase border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 rounded">
            Autonomous Mode
          </span>
        </div>
      )}

      {error && (!missions || missions.length === 0) && (
        <Card title="Error">
          <p className="text-crit">Failed to load missions: {error}</p>
        </Card>
      )}

      {missions && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {missions.map((mission: MissionBrief) => {
            const Icon = missionIcon(mission.id);
            const meta = MISSION_THEATER_META[mission.id] ?? MISSION_THEATER_META.wildfire;
            return (
              <div
                key={mission.id}
                className={`group relative rounded-2xl border border-slate-800/90 bg-gradient-to-b ${meta.gradientClass} p-6 shadow-xl transition-all duration-200 ${meta.borderAccent} flex flex-col justify-between`}
              >
                <div>
                  {/* Card Top Kicker & Sensor Badge */}
                  <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-800/80">
                    <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.16em] text-slate-300 font-bold">
                      <span className="p-1.5 rounded-lg bg-slate-900/90 border border-slate-700 text-cyan-300">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span>{mission.codename.toUpperCase()}</span>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full border font-mono text-[10px] font-bold tracking-wider ${meta.badgeColor}`}
                    >
                      {meta.badgeText}
                    </span>
                  </div>

                  {/* Mission Title & Story */}
                  <h3 className="mt-4 text-2xl font-bold text-slate-100 tracking-tight">
                    {mission.name}
                  </h3>
                  <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                    {missionStory(mission.id)}
                  </p>

                  {/* 3D Simulation Phenomenology Strip */}
                  <div className="mt-3.5 rounded-xl bg-slate-950/75 border border-slate-800/90 px-3 py-2 font-mono text-[11px] flex items-center gap-2">
                    <Cpu className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                    <span className="text-slate-300 truncate">{meta.phenomenology}</span>
                  </div>

                  {/* Orbital, Sensor & Edge AI Spec Grid */}
                  <div className="mt-3.5 grid grid-cols-3 gap-2.5 rounded-xl border border-slate-800/90 bg-slate-950/90 p-3 font-mono text-xs">
                    <div>
                      <span className="block text-[9px] uppercase tracking-wider text-slate-400">
                        Orbit Regime
                      </span>
                      <span className="text-slate-100 font-bold mt-0.5 block">
                        {mission.orbit_altitude_km} km · {mission.orbit_inclination_deg}°
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase tracking-wider text-slate-400">
                        Primary Sensor
                      </span>
                      <span className="text-cyan-300 font-bold mt-0.5 truncate block">
                        {meta.sensorDisplay}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase tracking-wider text-slate-400">
                        Edge AI Model
                      </span>
                      <span className="text-amber-300 font-bold mt-0.5 truncate block">
                        {meta.aiPipeline}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  {/* Complexity Meter & Hazard Tier */}
                  <div className="mt-5 flex items-center justify-between border-t border-slate-800/80 pt-3.5">
                    <ThreatComplexityMeter level={mission.difficulty} />
                    <StatusBadge
                      label={
                        mission.difficulty <= 2
                          ? "Tier I · Nominal LEO"
                          : mission.difficulty <= 3
                          ? "Tier II · High Data Load"
                          : "Tier III · Severe Hazard"
                      }
                      variant={severityVariant(mission.difficulty)}
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startFlight(mission.id, mission.name, false)}
                        className="inline-flex items-center gap-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-mono font-bold text-xs uppercase tracking-wider px-4 py-2.5 shadow-md transition-all cursor-pointer"
                      >
                        <Sliders className="h-3.5 w-3.5" aria-hidden />
                        Configure & Launch
                      </button>
                      <button
                        type="button"
                        onClick={() => startFlight(mission.id, mission.name, true)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-950/50 hover:bg-cyan-900/60 text-cyan-200 font-mono font-bold text-xs uppercase tracking-wider px-3.5 py-2.5 transition-all cursor-pointer"
                        title="Skip Hangar CAD and launch directly into 3D orbit"
                      >
                        <Rocket className="h-3.5 w-3.5" aria-hidden />
                        Quick Fly
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => navigate(`/missions/${mission.id}/brief`)}
                      className="text-xs font-mono text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
                    >
                      Briefing <ArrowRight className="inline h-3 w-3" aria-hidden />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
