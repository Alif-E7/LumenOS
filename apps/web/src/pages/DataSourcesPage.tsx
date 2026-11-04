import { Card } from "../components/Card";
import { DATA_PROVENANCE } from "../lib/constants";

export function DataSourcesPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-white mb-2">Data & Scientific Sources</h1>
        <p className="text-slate-400">
          LumenOS is committed to absolute scientific integrity and data transparency.
        </p>
      </div>

      {/* Mandatory Provenance Framework */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-white mb-4">Data Provenance Standard</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Object.entries(DATA_PROVENANCE).map(([key, item]) => (
            <Card key={key} title={item.label} icon="🏷️">
              <span className={`text-xs font-mono font-bold uppercase ${item.className} block mb-2`}>
                [{key}]
              </span>
              <p className="text-sm text-slate-300">{item.description}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Physics Models */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-white mb-4">Simulation Physics Engine</h2>
        <div className="space-y-4">
          <Card title="Orbital Mechanics (J2 Perturbation)" icon="🪐">
            <p className="text-sm text-slate-300 mb-2">
              Propagates Keplerian two-body motion with Earth oblateness (J₂ = 1.08263 × 10⁻³).
              Accurately models regression of the nodes (RAAN drift) and rate of perigee rotation.
            </p>
            <div className="bg-slate-950 p-3 rounded font-mono text-xs text-slate-400">
              dΩ/dt = -1.5 × J₂ × (R_earth / p)² × n × cos(i)
            </div>
          </Card>

          <Card title="Thermal Radiation Balance" icon="🌡️">
            <p className="text-sm text-slate-300 mb-2">
              Single-node heat balance equation balancing direct solar flux, Earth albedo, Earth infrared emission,
              internal dissipation, and radiator rejection into space via Stefan-Boltzmann law (σ = 5.670374 × 10⁻⁸ W/m²·K⁴).
            </p>
            <div className="bg-slate-950 p-3 rounded font-mono text-xs text-slate-400">
              Q_rejected = ε × σ × A_rad × (T⁴ - T_sink⁴)
            </div>
          </Card>

          <Card title="Power Subsystem & Solar Eclipse" icon="⚡">
            <p className="text-sm text-slate-300 mb-2">
              Cylindrical Earth shadow model detecting umbra/penumbra periods. Battery state-of-charge (SOC)
              charges during sunlit passes according to solar array incidence angle and drains during eclipse passes.
            </p>
          </Card>

          <Card title="Comms Link Budget & Ground Network" icon="📡">
            <p className="text-sm text-slate-300 mb-2">
              Slant-range calculation to 5 real ground stations: Svalbard (78.2°N), Goldstone (35.4°N),
              Madrid (40.4°N), Canberra (35.4°S), and Troll (72.0°S). Downlink rate depends on elevation angle and antenna gain.
            </p>
          </Card>
        </div>
      </section>

      {/* Reference Constants */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-white mb-4">Standard Reference Constants</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-800/80 text-xs uppercase text-slate-400 font-mono">
              <tr>
                <th className="px-4 py-3">Constant</th>
                <th className="px-4 py-3">Symbol</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              <tr>
                <td className="px-4 py-3">Earth Gravitational Parameter</td>
                <td className="px-4 py-3 font-mono text-cyan-400">μ (GM)</td>
                <td className="px-4 py-3 font-mono">398,600.4418 km³/s²</td>
                <td className="px-4 py-3 text-slate-500">IAU / NASA JPL</td>
              </tr>
              <tr>
                <td className="px-4 py-3">Earth Mean Equator Radius</td>
                <td className="px-4 py-3 font-mono text-cyan-400">R_earth</td>
                <td className="px-4 py-3 font-mono">6,378.137 km</td>
                <td className="px-4 py-3 text-slate-500">WGS-84 Standard</td>
              </tr>
              <tr>
                <td className="px-4 py-3">Solar Irradiance (1 AU)</td>
                <td className="px-4 py-3 font-mono text-cyan-400">S₀</td>
                <td className="px-4 py-3 font-mono">1,361.0 W/m²</td>
                <td className="px-4 py-3 text-slate-500">SORCE / TSIS-1 (NASA)</td>
              </tr>
              <tr>
                <td className="px-4 py-3">Stefan-Boltzmann Constant</td>
                <td className="px-4 py-3 font-mono text-cyan-400">σ</td>
                <td className="px-4 py-3 font-mono">5.670374 × 10⁻⁸ W/m²·K⁴</td>
                <td className="px-4 py-3 text-slate-500">CODATA 2018</td>
              </tr>
              <tr>
                <td className="px-4 py-3">Earth Bond Albedo</td>
                <td className="px-4 py-3 font-mono text-cyan-400">a</td>
                <td className="px-4 py-3 font-mono">0.306</td>
                <td className="px-4 py-3 text-slate-500">NASA Earth Fact Sheet</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Ethics statement */}
      <Card title="Scientific Integrity & Non-Fabrication Rule" icon="🛡️">
        <p className="text-sm text-slate-400 leading-relaxed">
          LumenOS never fabricates NASA observations. In scenarios where real NASA API feeds are unavailable,
          the system gracefully falls back to deterministic seeded simulated data labeled clearly as{" "}
          <span className="text-cyan-400 font-mono">[SIMULATED]</span>. AI predictions are clearly labeled as{" "}
          <span className="text-purple-400 font-mono">[AI_PREDICTION]</span> and can make realistic mistakes.
        </p>
      </Card>
    </div>
  );
}

