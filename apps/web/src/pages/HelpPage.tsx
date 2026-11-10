import { UserRound, Layers, Keyboard, Cpu, Radio, Thermometer, Zap } from "lucide-react";
import { Card } from "../components/Card";
import { ROLES } from "../lib/constants";
import { RoleBadge } from "../components/RoleBadge";

export function HelpPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 pt-10 pb-16 sm:px-6 lg:px-8">
      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-800/90 bg-gradient-to-r from-slate-950 via-slate-900/90 to-cyan-950/30 p-6 sm:p-8 shadow-2xl mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/40 bg-cyan-500/10 text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-300 mb-2">
          <Radio className="h-3 w-3 animate-pulse" /> Orbital Flight Operations & Edge-AI Systems Manual
        </div>
        <h1 className="text-3xl font-bold text-ink tracking-tight">
          Flight Academy & Tutorial
        </h1>
        <p className="text-slate-300 mt-1.5 max-w-2xl text-sm leading-relaxed">
          Master the 3-stage Orbital AI Crisis Containment loop, flight deck keyboard controls, and
          spacecraft thermal/power physics across all four Earth-monitoring missions.
        </p>
      </div>

      {/* Interactive 3-Stage Flight Deck Controls & Keyboard Shortcuts */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-ink mb-4 flex items-center gap-2">
          <Keyboard className="h-5 w-5 text-cyan-400" /> 3D Flight Deck Controls & 3-Stage AI Containment Loop
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 font-mono">
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-300">STAGE 1 · SENSOR SCAN</span>
              <kbd className="px-2 py-0.5 rounded bg-slate-900 border border-emerald-500/40 text-emerald-300 text-xs">
                Key [E]
              </kbd>
            </div>
            <p className="text-xs text-slate-300 mt-2 font-sans leading-relaxed">
              Fly your Scout Satellite within the 950 km nadir sensor cone of a crisis target and hold or
              press <strong>[E]</strong> to lock multi-spectral telemetry (SWIR, SAR, UV/InSAR, or MHD).
            </p>
          </div>

          <div className="rounded-2xl border border-purple-500/40 bg-purple-950/20 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-purple-300">STAGE 2 · 24-TOPS EDGE AI</span>
              <kbd className="px-2 py-0.5 rounded bg-slate-900 border border-purple-500/40 text-purple-300 text-xs">
                Key [R]
              </kbd>
            </div>
            <p className="text-xs text-slate-300 mt-2 font-sans leading-relaxed">
              Press <strong>[R]</strong> to execute onboard neural inference (25:1 to 50:1 vector
              compression). Watch your radiator core temperature and press <strong>[T]</strong> if needed.
            </p>
          </div>

          <div className="rounded-2xl border border-cyan-500/40 bg-cyan-950/20 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-300">STAGE 3 · OPTICAL ISL BEAM</span>
              <kbd className="px-2 py-0.5 rounded bg-slate-900 border border-cyan-500/40 text-cyan-300 text-xs">
                Key [F]
              </kbd>
            </div>
            <p className="text-xs text-slate-300 mt-2 font-sans leading-relaxed">
              Press <strong>[F]</strong> to route the compressed AI vector alert through the 1550 nm Optical
              Laser Mesh to contain the crisis on Earth and earn +3,500 cr!
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
          <div>
            <span className="text-cyan-300 font-bold block">W / A / S / D or Arrows</span>
            <span className="text-slate-400 text-[11px]">RCS Orbital Attitude Steer</span>
          </div>
          <div>
            <span className="text-amber-300 font-bold block">Spacebar / Shift</span>
            <span className="text-slate-400 text-[11px]">Hall-Effect Ion Prograde Boost</span>
          </div>
          <div>
            <span className="text-emerald-300 font-bold block">Key [C] or [V]</span>
            <span className="text-slate-400 text-[11px]">Cycle 5 Camera Modes (Event Cam)</span>
          </div>
          <div>
            <span className="text-purple-300 font-bold block">Key [T]</span>
            <span className="text-slate-400 text-[11px]">Active Louver Radiator Purge</span>
          </div>
        </div>
      </section>

      {/* The Core Loop */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-ink mb-4">The Mission Loop</h2>
        <Card title="How a Mission Works" icon={<UserRound className="h-4 w-4" />}>
          <ol className="space-y-3 text-sm text-ink list-decimal list-inside">
            <li>
              <span className="font-semibold text-ink">Select a Mission Contract:</span> Choose one of four
              Earth/Space science challenges. Each has primary objectives, secondary science goals, a strict
              deadline, and a finite budget.
            </li>
            <li>
              <span className="font-semibold text-ink">Design & Configure Spacecraft:</span> Size your solar
              panels for power in sunlight, battery for eclipse survival, radiators for thermal cooling,
              antenna for ground link, and matching sensor payload.
            </li>
            <li>
              <span className="font-semibold text-ink">Design Review & Pre-Flight Validation:</span> Verify
              mass, power, and thermal margins against the mission requirements before countdown.
            </li>
            <li>
              <span className="font-semibold text-ink">Launch & Ignition:</span> Execute the automated range
              checklist and inject into target orbit.
            </li>
            <li>
              <span className="font-semibold text-ink">Operate in Orbit:</span> Advance the simulation clock
              step-by-step. Keep battery and thermal margins safe during eclipses. Downlink data when
              passing over ground stations.
            </li>
            <li>
              <span className="font-semibold text-ink">Respond to Events:</span> In-flight anomalies (solar
              flares, sensor degradation, eclipse cooling) require team decisions with trade-offs.
            </li>
            <li>
              <span className="font-semibold text-ink">Post-Mission Debrief & Replay:</span> Receive a
              transparent score breakdown, earn XP and engineering credits, and analyze what-if branches.
            </li>
          </ol>
        </Card>
      </section>

      {/* The 4 Stations / Roles */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-ink mb-4">The Four Flight Deck Stations</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Mission Director" icon={<ROLES.mission_director.Icon className="h-4 w-4" />}>
            <RoleBadge role="mission_director" className="mb-3" />
            <p className="text-sm text-ink">
              Oversees contract fulfillment, manages the budget, re-ranks objective priorities, and
              authorizes critical high-stakes event decisions.
            </p>
          </Card>

          <Card title="Systems Engineer" icon={<ROLES.systems_engineer.Icon className="h-4 w-4" />}>
            <RoleBadge role="systems_engineer" className="mb-3" />
            <p className="text-sm text-ink">
              Monitors bus temperature, battery state of charge (SOC), and CPU load. Toggles payload power,
              sheds non-essential loads during deep eclipse, and trims radiators.
            </p>
          </Card>

          <Card title="Science Officer" icon={<ROLES.science_officer.Icon className="h-4 w-4" />}>
            <RoleBadge role="science_officer" className="mb-3" />
            <p className="text-sm text-ink">
              Schedules observation windows, collects scientific measurements over disaster zones, and
              manages downlink transmission buffers when passing ground stations.
            </p>
          </Card>

          <Card title="Flight Controller" icon={<ROLES.flight_controller.Icon className="h-4 w-4" />}>
            <RoleBadge role="flight_controller" className="mb-3" />
            <p className="text-sm text-ink">
              Monitors orbit altitude, velocity, and sub-satellite ground track. Executes prograde/retrograde
              delta-v thruster burns and adjusts attitude orientation (Sun-pointing, Nadir, Radiator-safe).
            </p>
          </Card>
        </div>
      </section>

      {/* Solo vs Co-op */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-ink mb-4">Solo vs Cooperative Play</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card title="Solo: All Stations Mode" icon={<UserRound className="h-4 w-4" />}>
            <p className="text-sm text-ink mb-2">
              Fly completely alone. You have immediate access to all four stations via tabbed consoles. No
              account, no room codes, and no internet co-players needed.
            </p>
          </Card>
          <Card title="Co-op: Multiplayer Crew" icon={<Layers className="h-4 w-4" />}>
            <p className="text-sm text-ink mb-2">
              Share one live simulation session with 2–4 players using a private 6-letter room code. Roles
              are distributed among crew members. Decisions and telemetry are synchronized live.
            </p>
          </Card>
        </div>
      </section>

      {/* Orbital Physics Reference */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-ink mb-4">Sunrise Orbit Onboarding Academy</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
            <Zap className="h-4 w-4 text-amber-400 mb-2" />
            <div className="text-sm font-bold text-slate-100">1. Solar vs. Umbra Power</div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Triple-junction GaAs arrays generate peak power in sunlight (1361 W/m²). During the 35-minute
              Earth shadow, battery SoC sustains all 24-TOPS compute blades.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
            <Thermometer className="h-4 w-4 text-orange-400 mb-2" />
            <div className="text-sm font-bold text-slate-100">2. Stefan-Boltzmann Radiators</div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Because space is a vacuum, waste heat from AI server blades must be rejected via infrared
              radiation ($Q = \epsilon \sigma A T^4$) through deployable radiator wings.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
            <Cpu className="h-4 w-4 text-cyan-400 mb-2" />
            <div className="text-sm font-bold text-slate-100">3. Edge AI vs. Raw Downlink</div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Raw hyperspectral & SAR imagery saturates RF downlinks. Onboard neural inference compresses
              crisis perimeters 25:1–50:1 for instant 1550 nm Optical ISL relay.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
