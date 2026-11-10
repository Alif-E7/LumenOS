import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { getHealth } from "../api/client";
import { Button } from "../components/Button";
import { StatusBadge } from "../components/StatusBadge";
import { ShipPreview3D } from "../components/flight/ShipPreview3D";
import { loadMissionSession, saveMissionSession, newPlayerId } from "../lib/mission";
import { Rocket, Users, Wrench, ArrowRight, Radio, Globe, Award, BarChart3, Flame, Waves, Mountain, Sun } from "lucide-react";

const QUICK_THEATERS = [
  {
    id: "wildfire",
    name: "Wildfire Scout",
    sensor: "3.9 µm SWIR · FireNet AI",
    desc: "Track anisotropic forest fire fronts, pyrocumulus smoke plumes, and burn-scar coal veins.",
    icon: Flame,
    accent: "text-orange-400 border-orange-500/30 bg-orange-950/20 hover:border-orange-400/60",
  },
  {
    id: "flood",
    name: "Flood Scout",
    sensor: "5.4 GHz SAR · HydroMask AI",
    desc: "Penetrate monsoon cloud anvils to map branching river-valley inundation & flood contours.",
    icon: Waves,
    accent: "text-cyan-400 border-cyan-500/30 bg-cyan-950/20 hover:border-cyan-400/60",
  },
  {
    id: "volcano",
    name: "Volcano Watch",
    sensor: "UV/InSAR · PlumeCast AI",
    desc: "Monitor 3D stratovolcano relief, 5 dendritic lava gullies, and Plinian ash umbrella clouds.",
    icon: Mountain,
    accent: "text-fuchsia-400 border-fuchsia-500/30 bg-fuchsia-950/20 hover:border-fuchsia-400/60",
  },
  {
    id: "solar_storm",
    name: "Solar Storm Sentinel",
    sensor: "EUV/MHD · HelioShield AI",
    desc: "Observe propagating CME plasma clouds, Earth magnetopause bow-shock compression & polar auroras.",
    icon: Sun,
    accent: "text-emerald-400 border-emerald-500/30 bg-emerald-950/20 hover:border-emerald-400/60",
  },
] as const;

export function HomePage() {
  const navigate = useNavigate();
  const { data: health, loading, error } = useApi(getHealth);
  const session = loadMissionSession();
  const hasActiveFlight = !!(session && session.sessionId);

  const quickLaunchMission = (missionId: string, missionName: string) => {
    saveMissionSession({
      mode: "solo",
      missionId,
      missionName,
      spacecraftId: null,
      sessionId: null,
      playerId: newPlayerId(),
      roomCode: null,
      experience: "simple",
    });
    navigate("/play", { state: { missionId } });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
      {/* Active mission banner */}
      {hasActiveFlight && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-cyan-500/40 bg-cyan-950/30 px-5 py-3.5 shadow-lg">
          <div className="flex items-center gap-3">
            <Radio aria-hidden className="h-4 w-4 animate-pulse text-cyan-400" />
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-cyan-300">
                Active Orbital Sortie — {session.missionName}
              </p>
              <p className="mt-0.5 text-xs text-slate-300">
                {session.mode === "solo" ? "Solo · All 4 Flight Deck Stations" : `Co-Op Crew · Room ${session.roomCode}`}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() =>
              navigate(session.experience === "expert" || session.mode === "coop" ? "/operate" : "/play")
            }
          >
            Resume Flight Deck <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      )}

      {/* Two-Column Aerospace Command Hero */}
      <section className="relative rounded-3xl border border-slate-800/90 bg-gradient-to-br from-slate-950 via-[#050b16] to-cyan-950/25 p-6 sm:p-10 lg:p-12 shadow-2xl overflow-hidden">
        <div className="grid lg:grid-cols-12 gap-8 items-center">
          {/* Left Column (7 cols): Mission Command Briefing & Primary CTAs */}
          <div className="lg:col-span-7 text-left">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-cyan-500/40 bg-cyan-500/10 text-[11px] font-mono uppercase tracking-[0.18em] text-cyan-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              LumenOS Orbital AI Data Center & Earth-Monitoring Command
            </div>

            <h1
              aria-label="Fly your own satellite!"
              className="mt-4 text-4xl sm:text-5xl font-bold text-slate-100 leading-[1.12] tracking-tight"
            >
              Command an Orbital AI{" "}
              <span className="bg-gradient-to-r from-cyan-300 via-sky-200 to-amber-300 bg-clip-text text-transparent">
                Satellite Constellation
              </span>
            </h1>

            <p className="mt-4 text-slate-300 text-base sm:text-lg max-w-2xl leading-relaxed">
              Deploy modular edge-AI spacecraft into Low Earth Orbit, balance Stefan-Boltzmann radiator
              rejection and 24-TOPS neural compute blades, and contain real-time planetary crises across a
              6-satellite optical laser mesh.
            </p>

            {/* 4 Key Architecture Specs */}
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
              <div className="rounded-xl border border-slate-800/90 bg-slate-950/80 p-3">
                <div className="text-[10px] uppercase text-slate-400">Edge AI Compute</div>
                <div className="text-sm font-bold text-amber-300 mt-0.5">24 TOPS Rad-Hard</div>
                <div className="text-[10px] text-slate-400 mt-0.5">50:1 Vector Compression</div>
              </div>
              <div className="rounded-xl border border-slate-800/90 bg-slate-950/80 p-3">
                <div className="text-[10px] uppercase text-slate-400">Optical Crosslink</div>
                <div className="text-sm font-bold text-cyan-300 mt-0.5">1550 nm · 10 Gbps</div>
                <div className="text-[10px] text-slate-400 mt-0.5">6-Node OISL Laser Mesh</div>
              </div>
              <div className="rounded-xl border border-slate-800/90 bg-slate-950/80 p-3">
                <div className="text-[10px] uppercase text-slate-400">Thermal Physics</div>
                <div className="text-sm font-bold text-orange-300 mt-0.5">Stefan-Boltzmann</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Deployable Louver Wings</div>
              </div>
              <div className="rounded-xl border border-slate-800/90 bg-slate-950/80 p-3">
                <div className="text-[10px] uppercase text-slate-400">Crisis Theaters</div>
                <div className="text-sm font-bold text-emerald-300 mt-0.5">4 Global Missions</div>
                <div className="text-[10px] text-slate-400 mt-0.5">SWIR · SAR · UV · MHD</div>
              </div>
            </div>

            {/* Primary CTA Buttons */}
            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <button
                type="button"
                aria-label="Play"
                onClick={() => navigate("/missions")}
                className="inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-400 to-cyan-400 px-8 py-4 text-sm sm:text-base font-mono font-bold uppercase tracking-wider text-slate-950 shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:from-emerald-300 hover:to-cyan-300 transition-all cursor-pointer"
              >
                <Rocket className="h-5 w-5" aria-hidden />
                PLAY MISSION CAMPAIGN
              </button>
              <button
                type="button"
                onClick={() => navigate("/globe")}
                className="inline-flex items-center gap-2.5 rounded-2xl border border-cyan-500/40 bg-cyan-950/40 px-6 py-4 text-sm font-mono font-bold text-cyan-200 hover:bg-cyan-900/50 transition-all cursor-pointer"
              >
                <Globe className="h-4 w-4 text-cyan-300" aria-hidden />
                Interactive 3D Earth & Constellation
              </button>
            </div>
          </div>

          {/* Right Column (5 cols): Live Interactive 3D Orbital AI Data Center Spacecraft */}
          <div className="lg:col-span-5">
            <ShipPreview3D
              archetype="sprinter"
              batterySize="L"
              solarSize="L"
              antennaSize="L"
              className="w-full h-[350px] sm:h-[390px]"
            />
          </div>
        </div>
      </section>

      {/* 4 Global Environmental Simulation Theaters — 1-Click Direct Launch */}
      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-100">
              Active Global Environmental Simulation Theaters
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Click any theater to launch directly into its real-time 3D GLSL environmental simulation, or open the Hangar CAD.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/missions")}
            className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
          >
            View Full Mission Briefings <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {QUICK_THEATERS.map((th) => {
            const Icon = th.icon;
            return (
              <div
                key={th.id}
                className={`rounded-2xl border p-4 transition-all flex flex-col justify-between ${th.accent}`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="p-2 rounded-xl bg-slate-950/80 border border-slate-800">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="font-mono text-[10px] text-slate-300 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800">
                      {th.sensor}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-100 mt-3">{th.name}</h3>
                  <p className="text-xs text-slate-300/90 mt-1 leading-relaxed">{th.desc}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => quickLaunchMission(th.id, th.name)}
                    className="text-xs font-mono font-bold text-cyan-300 hover:text-cyan-200 flex items-center gap-1 cursor-pointer"
                  >
                    Launch 3D Flight <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/hangar?mission=${th.id}`)}
                    className="text-[11px] font-mono text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    Hangar CAD
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Secondary Command Modules Grid */}
      <section className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 font-mono">
        <button
          type="button"
          aria-label="Fly with Friends"
          onClick={() => navigate("/coop")}
          className="rounded-2xl border border-slate-800/90 bg-slate-950/80 hover:border-cyan-500/40 p-4 text-left transition-all cursor-pointer flex items-start gap-3"
        >
          <span className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
            <Users className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <div className="text-xs font-bold text-slate-100">Co-Op Flight Deck</div>
            <div className="text-[11px] text-slate-400 mt-0.5 font-sans">
              4-station multiplayer crew synchronization via room code.
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate("/rewards")}
          className="rounded-2xl border border-slate-800/90 bg-slate-950/80 hover:border-amber-500/40 p-4 text-left transition-all cursor-pointer flex items-start gap-3"
        >
          <span className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300">
            <Award className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <div className="text-xs font-bold text-slate-100">Career & Hardware Unlocks</div>
            <div className="text-[11px] text-slate-400 mt-0.5 font-sans">
              Spend engineering credits on Li-Sulfur & SAR hardware modules.
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate("/benchmark")}
          className="rounded-2xl border border-slate-800/90 bg-slate-950/80 hover:border-purple-500/40 p-4 text-left transition-all cursor-pointer flex items-start gap-3"
        >
          <span className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300">
            <BarChart3 className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <div className="text-xs font-bold text-slate-100">AI Control Benchmark</div>
            <div className="text-[11px] text-slate-400 mt-0.5 font-sans">
              Compare Human vs. Heuristic vs. Autonomous AI orbital policies.
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate("/design")}
          className="rounded-2xl border border-slate-800/90 bg-slate-950/80 hover:border-emerald-500/40 p-4 text-left transition-all cursor-pointer flex items-start gap-3"
        >
          <span className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
            <Wrench className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <div className="text-xs font-bold text-slate-100">Systems Engineering Console</div>
            <div className="text-[11px] text-slate-400 mt-0.5 font-sans">
              Full subsystem mass, power, link budget & thermal CAD architect.
            </div>
          </div>
        </button>
      </section>

      {/* System Telemetry Status Bar */}
      <section className="mt-8 pt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {loading && <StatusBadge label="Connecting Telemetry" variant="warning" />}
          {error && <StatusBadge label="Autonomous Local Physics Engine" variant="info" />}
          {health && (
            <>
              <StatusBadge label={`${health.app} v${health.version}`} variant="success" />
              <StatusBadge label="Orbital Simulation Engine Online" variant="success" />
            </>
          )}
          <StatusBadge label="6-Node OISL Constellation Ready" variant="info" />
        </div>
        <span className="font-mono text-[11px] text-slate-400">
          WEBGL2 GLSL SHADERS · ACES FILMIC TONE MAPPING · 3-LEVEL LOD
        </span>
      </section>
    </div>
  );
}
