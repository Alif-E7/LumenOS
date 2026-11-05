import { Card } from "../components/Card";
import { RoleBadge } from "../components/RoleBadge";

export function HelpPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-white mb-2">Flight Academy & Tutorial</h1>
        <p className="text-slate-400">
          Everything you need to know to design, launch, and command orbital missions.
        </p>
      </div>

      {/* The Core Loop */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-white mb-4">The Mission Loop</h2>
        <Card title="How a Mission Works" icon="🔄">
          <ol className="space-y-3 text-sm text-slate-300 list-decimal list-inside">
            <li>
              <span className="font-semibold text-white">Select a Mission Contract:</span> Choose one of four Earth/Space science challenges. Each has primary objectives, secondary science goals, a strict deadline, and a finite budget.
            </li>
            <li>
              <span className="font-semibold text-white">Design & Configure Spacecraft:</span> Size your solar panels for power in sunlight, battery for eclipse survival, radiators for thermal cooling, antenna for ground link, and matching sensor payload.
            </li>
            <li>
              <span className="font-semibold text-white">Design Review & Pre-Flight Validation:</span> Verify mass, power, and thermal margins against the mission requirements before countdown.
            </li>
            <li>
              <span className="font-semibold text-white">Launch & Ignition:</span> Execute the automated range checklist and inject into target orbit.
            </li>
            <li>
              <span className="font-semibold text-white">Operate in Orbit:</span> Advance the simulation clock step-by-step. Keep battery and thermal margins safe during eclipses. Downlink data when passing over ground stations.
            </li>
            <li>
              <span className="font-semibold text-white">Respond to Events:</span> In-flight anomalies (solar flares, sensor degradation, eclipse cooling) require team decisions with trade-offs.
            </li>
            <li>
              <span className="font-semibold text-white">Post-Mission Debrief & Replay:</span> Receive a transparent score breakdown, earn XP and engineering credits, and analyze what-if branches.
            </li>
          </ol>
        </Card>
      </section>

      {/* The 4 Stations / Roles */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-white mb-4">The Four Flight Deck Stations</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Mission Director" icon="🎖️">
            <RoleBadge role="mission_director" className="mb-3" />
            <p className="text-sm text-slate-300">
              Oversees contract fulfillment, manages the budget, re-ranks objective priorities,
              and authorizes critical high-stakes event decisions.
            </p>
          </Card>

          <Card title="Systems Engineer" icon="🔧">
            <RoleBadge role="systems_engineer" className="mb-3" />
            <p className="text-sm text-slate-300">
              Monitors bus temperature, battery state of charge (SOC), and CPU load. Toggles payload
              power, sheds non-essential loads during deep eclipse, and trims radiators.
            </p>
          </Card>

          <Card title="Science Officer" icon="🔬">
            <RoleBadge role="science_officer" className="mb-3" />
            <p className="text-sm text-slate-300">
              Schedules observation windows, collects scientific measurements over disaster zones,
              and manages downlink transmission buffers when passing ground stations.
            </p>
          </Card>

          <Card title="Flight Controller" icon="🚀">
            <RoleBadge role="flight_controller" className="mb-3" />
            <p className="text-sm text-slate-300">
              Monitors orbit altitude, velocity, and sub-satellite ground track. Executes prograde/retrograde
              delta-v thruster burns and adjusts attitude orientation (Sun-pointing, Nadir, Radiator-safe).
            </p>
          </Card>
        </div>
      </section>

      {/* Solo vs Co-op */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-white mb-4">Solo vs Cooperative Play</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card title="Solo: All Stations Mode" icon="🧑🚀">
            <p className="text-sm text-slate-300 mb-2">
              Fly completely alone. You have immediate access to all four stations via tabbed consoles.
              No account, no room codes, and no internet co-players needed.
            </p>
          </Card>
          <Card title="Co-op: Multiplayer Crew" icon="👥">
            <p className="text-sm text-slate-300 mb-2">
              Share one live simulation session with 2–4 players using a private 6-letter room code.
              Roles are distributed among crew members. Decisions and telemetry are synchronized live.
            </p>
          </Card>
        </div>
      </section>

      {/* Beginner Mode vs Engineer Mode */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-white mb-4">Progressive Disclosure: Explorer vs Engineer Mode</h2>
        <Card title="Ages 10–15 Friendly + Advanced Telemetry" icon="⚙️">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-300">
            <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800">
              <span className="font-semibold text-amber-400 block mb-1">Explorer Mode (Cadet)</span>
              <p>
                Guided choices, plain-language cues, safety guardrails, and contextual tooltips.
                Ideal for ages 10–15 and classroom mission architecture.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800">
              <span className="font-semibold text-cyan-400 block mb-1">Engineer Mode (Advanced)</span>
              <p>
                Raw telemetry matrices: instantaneous solar flux vectors, radiative heat balance equations,
                true anomaly in degrees, exact RF slant range, and watt-hour discharge curves.
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* Sunrise Orbit Tutorial Section */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-white mb-4">Sunrise Orbit Onboarding Academy</h2>
        <Card title="The 5 Orbital Stages of Flight" icon="🌅">
          <div className="space-y-3 text-sm text-slate-300">
            <div className="flex gap-3">
              <span className="font-bold text-cyan-400 shrink-0">1. Orbit Basics:</span>
              <span>Forward velocity (~7.67 km/s) continuously balances Earth's gravitational pull at 400 km.</span>
            </div>
            <div className="flex gap-3">
              <span className="font-bold text-cyan-400 shrink-0">2. Sunlight Power:</span>
              <span>Solar arrays convert 1361 W/m² solar insolation into electrical power, charging the battery.</span>
            </div>
            <div className="flex gap-3">
              <span className="font-bold text-cyan-400 shrink-0">3. Earth Shadow:</span>
              <span>Roughly 35 minutes of each 92-minute orbit is total darkness. Solar power generation drops to 0 W.</span>
            </div>
            <div className="flex gap-3">
              <span className="font-bold text-cyan-400 shrink-0">4. Battery Management:</span>
              <span>Shed non-essential instrument loads to prevent battery Depth of Discharge (DoD) from triggering brownouts.</span>
            </div>
            <div className="flex gap-3">
              <span className="font-bold text-cyan-400 shrink-0">5. Sunrise Recharge:</span>
              <span>Emerging from Earth's umbra restores solar power generation and recharges batteries to 100%.</span>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
