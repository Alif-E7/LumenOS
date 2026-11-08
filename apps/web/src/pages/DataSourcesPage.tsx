import { Card } from "../components/Card";
import { ProvenanceBadge } from "../components/ProvenanceBadge";
import { DATA_PROVENANCE } from "../lib/constants";

export function DataSourcesPage() {
  const canonicalCategories = [
    "REAL_NASA_REFERENCE",
    "SIMULATED_SPACECRAFT",
    "SIMULATED_ENVIRONMENT",
    "MODEL_PREDICTION",
  ] as const;

  const dataSources = [
    {
      sourceId: "nasa_firms_viirs",
      name: "NASA FIRMS VIIRS 375m Active Fire Detections",
      code: "VNP14IMGTDL_NRT (v2.0NRT)",
      agency: "NASA LANCE / EOSDIS / Univ. of Maryland",
      coverage: "Global active fire pixels at 375m nadir resolution (~3-hr latency)",
      units: "FRP (MW), Brightness Temp (K), Pixel Area (km²)",
      scenario: "Wildfire Scout — Eyes on Fire",
      license: "NASA Open Data (Public Domain / CC0-compatible)",
      status: "Verified",
    },
    {
      sourceId: "nasa_tsis1_tsi",
      name: "NASA TSIS-1 Total Solar Irradiance (TSI)",
      code: "TSIS-1_TSI_L3 (v02r01)",
      agency: "NASA GSFC / LASP (Univ. of Colorado Boulder)",
      coverage: "Top of Atmosphere (TOA) at 1 AU daily continuous",
      units: "Total Solar Irradiance (1361.0 W/m² ± 0.11 W/m²)",
      scenario: "All Scenarios (Power & Thermal Solar Flux)",
      license: "NASA Open Data (Public Domain)",
      status: "Verified",
    },
    {
      sourceId: "nasa_ceres_ebaf",
      name: "NASA CERES EBAF TOA Radiation Fluxes",
      code: "CERES_EBAF-TOA (Edition 4.2)",
      agency: "NASA Langley Research Center ASDC",
      coverage: "Global 1°x1° monthly climatological gridded fluxes",
      units: "Albedo (0.30), Earth Outgoing IR (237.0 W/m²)",
      scenario: "All Scenarios (Thermal Equilibrium Model)",
      license: "NASA Open Data (Public Domain)",
      status: "Verified",
    },
    {
      sourceId: "noaa_donki_space_weather",
      name: "NASA DONKI & NOAA SWPC Space Weather Catalog",
      code: "DONKI_CME_FLR (API v2.0)",
      agency: "NASA CCMC / NOAA SWPC",
      coverage: "Heliospheric solar flare & CME notifications",
      units: "CME Speed (km/s), X-ray Flux (W/m²), Kp (0-9)",
      scenario: "Solar Storm Sentinel — Watch the Sun",
      license: "US Government Work (Public Domain)",
      status: "Verified",
    },
    {
      sourceId: "copernicus_sentinel1_flood",
      name: "Copernicus Sentinel-1 SAR & DFO Flood Boundaries",
      code: "S1_GRD_DFO (v1.0)",
      agency: "Copernicus (ESA) / NASA ASF DAAC / DFO",
      coverage: "Brahmaputra and Ganges river delta floodplains",
      units: "Inundation Area (km²), Radar Backscatter (dB)",
      scenario: "Flood Scout — Rising Waters",
      license: "Creative Commons Attribution 4.0 (CC BY 4.0)",
      status: "Verified",
    },
    {
      sourceId: "tropomi_modvolc_volcano",
      name: "Sentinel-5P TROPOMI SO2 & MODVOLC Anomaly Catalog",
      code: "TROPOMI_SO2_MODVOLC (L2 v2.0 / v1.0)",
      agency: "Copernicus / NASA GES DISC / Univ. of Hawaii HIGP",
      coverage: "Active caldera anomalies: Mount Merapi and Anak Krakatau",
      units: "SO2 Column Density (DU), Thermal Radiance (W/m²·sr·µm)",
      scenario: "Volcano Watch — Fire Beneath the Earth",
      license: "Copernicus Open Access / NASA Open Data",
      status: "Verified",
    },
    {
      sourceId: "nasa_norad_tle_ephemeris",
      name: "NASA & NORAD Satellite TLE Ephemeris Reference",
      code: "NORAD_TLE_EO (Standard 2-Line)",
      agency: "NASA Flight Dynamics Facility / 18th SDS via CelesTrak",
      coverage: "Flagship Earth orbiters (Terra, Aqua, Suomi NPP, Sentinel-1A)",
      units: "Semi-Major Axis (km), Inclination (°), Mean Motion (rev/day)",
      scenario: "Orbital Propagation Numerical Validation",
      license: "Public Domain (US Government satellite ephemeris)",
      status: "Verified",
    },
  ];

  return (
 <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
 <div className="mb-10">
 <h1 className="text-3xl font-bold text-ink mb-2">Authoritative Data & Scientific Sources</h1>
 <p className="text-muted">
          LumenOS is committed to absolute scientific integrity, verifiable data provenance, and transparent simulation calibration.
 </p>
 </div>

      {/* Mandatory Provenance Framework */}
 <section className="mb-12">
 <h2 className="text-xl font-bold text-ink mb-4">Semantic Data Provenance Framework</h2>
 <p className="text-sm text-muted mb-6">
          Every telemetry field, observation target, and AI advisory in LumenOS carries an immutable provenance category tag to ensure players and students always know whether data originates from real empirical NASA archives, in-flight simulated spacecraft instruments, or predictive model forecasts.
 </p>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {canonicalCategories.map((key) => {
            const item = DATA_PROVENANCE[key];
            return (
 <Card key={key} title={item.label} icon="🏷️">
 <div className="mb-3">
 <ProvenanceBadge provenance={key} />
 </div>
 <p className="text-sm text-ink mb-2">{item.description}</p>
 <p className="text-xs text-muted border-t border-edge/80 pt-2 font-mono">
                  {item.disclaimer}
 </p>
 </Card>
 );
          })}
 </div>
 </section>

      {/* Crucial NASA FIRMS Educational Notice */}
 <div className="mb-12 rounded-none border border-accent/40 bg-accent/10 p-6">
 <div className="flex items-start gap-4">
 <span className="text-2xl" aria-hidden></span>
 <div>
 <div className="flex items-center gap-2 mb-2">
 <h3 className="text-lg font-bold text-accent-hi">NASA FIRMS Operational Ground Truth Disclaimer</h3>
 <ProvenanceBadge provenance="REAL_NASA_REFERENCE" />
 </div>
 <p className="text-sm text-ink leading-relaxed mb-3">
              NASA FIRMS active fire detections are real-world empirical measurements acquired by the Visible Infrared Imaging Radiometer Suite (VIIRS) on the Suomi NPP and NOAA-20 polar-orbiting satellites.
 </p>
 <p className="text-sm text-accent-hi font-medium">
              They are <strong>NOT</strong> images or telemetry captured by the fictional LumenOS satellite, and they do not represent infallible ground truth. In Wildfire Scout, FIRMS detections serve as an independent operational reference against which player satellite alerts are evaluated.
 </p>
 </div>
 </div>
 </div>

      {/* Authoritative Data & Sources Register Table */}
 <section className="mb-12">
 <div className="flex items-center justify-between mb-4">
 <h2 className="text-xl font-bold text-ink">Authoritative Data & Sources Register</h2>
 <span className="text-xs font-mono text-info bg-info/10 border border-info/30 px-2.5 py-1 rounded-full">
            7 Verified Products
 </span>
 </div>
 <div className="overflow-x-auto rounded-none border border-edge bg-panel/40">
 <table className="w-full text-left text-sm text-ink">
 <thead className="bg-raised/80 text-xs uppercase text-muted font-mono">
 <tr>
 <th className="px-4 py-3">Dataset / Product</th>
 <th className="px-4 py-3">Agency / Provider</th>
 <th className="px-4 py-3">Coverage & Units</th>
 <th className="px-4 py-3">Gameplay Role</th>
 <th className="px-4 py-3">License</th>
 <th className="px-4 py-3">Status</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-edge text-xs">
              {dataSources.map((s) => (
 <tr key={s.sourceId} className="hover:bg-raised/30 transition-colors">
 <td className="px-4 py-3 font-medium text-ink">
 <div>{s.name}</div>
 <div className="text-[11px] font-mono text-info">{s.code}</div>
 </td>
 <td className="px-4 py-3 text-muted">{s.agency}</td>
 <td className="px-4 py-3">
 <div className="text-ink">{s.coverage}</div>
 <div className="font-mono text-muted mt-0.5">{s.units}</div>
 </td>
 <td className="px-4 py-3 text-warn font-medium">{s.scenario}</td>
 <td className="px-4 py-3 text-muted">{s.license}</td>
 <td className="px-4 py-3">
 <span className="inline-block px-2 py-0.5 rounded-none text-[10px] font-mono uppercase font-bold bg-ok/10 text-ok border border-ok/30">
                      {s.status}
 </span>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </section>

      {/* Offline First & Zero Key Guarantee */}
 <section className="mb-12">
 <h2 className="text-xl font-bold text-ink mb-4">Offline-First Architecture & Non-Fabrication</h2>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Card title="Zero API Credential Requirement">
 <p className="text-sm text-ink leading-relaxed mb-2">
              LumenOS bundles versioned offline sample datasets for all 7 reference sources in <code className="text-info font-mono">data/offline/</code>.
 </p>
 <p className="text-sm text-muted">
              The application runs completely offline in classroom, air-gapped, or test settings without needing external internet access or third-party API keys.
 </p>
 </Card>
 <Card title="No Fabricated Tokens or Responses" icon="⚖️">
 <p className="text-sm text-ink leading-relaxed mb-2">
              LumenOS never fabricates API keys, mock telemetry pretending to be NASA live servers, or fake authentication responses.
 </p>
 <p className="text-sm text-muted">
              When live API keys are not supplied in the environment, the backend honestly reports <span className="font-mono text-warn">offline_fallback_active</span> and uses the verified local offline bundle.
 </p>
 </Card>
 </div>
 </section>

      {/* Physics Models */}
 <section className="mb-12">
 <h2 className="text-xl font-bold text-ink mb-4">Simulation Physics Engine Calibration</h2>
 <div className="space-y-4">
 <Card title="Orbital Mechanics (J2 Perturbation & Keplerian Motion)">
 <p className="text-sm text-ink mb-2">
              Propagates Keplerian two-body motion with Earth oblateness (J₂ = 1.08263 × 10⁻³).
              Accurately models regression of the nodes (RAAN drift) for sun-synchronous orbits, validated against real NORAD TLEs for Terra, Aqua, and Suomi NPP.
 </p>
 <div className="bg-void p-3 rounded-none font-mono text-xs text-muted">
              dΩ/dt = -1.5 × J₂ × (R_earth / p)² × n × cos(i)
 </div>
 </Card>

 <Card title="Thermal Radiation Balance (CERES & TSIS-1 Calibrated)">
 <p className="text-sm text-ink mb-2">
              Single-node heat balance equation balancing direct solar flux (TSIS-1: S₀ = 1361.0 W/m²), Earth albedo (CERES: a = 0.30), Earth infrared emission (CERES: q_ir = 237.0 W/m²),
              internal dissipation, and radiator rejection into space via Stefan-Boltzmann law (σ = 5.670374 × 10⁻⁸ W/m²·K⁴).
 </p>
 <div className="bg-void p-3 rounded-none font-mono text-xs text-muted">
              Q_rejected = ε × σ × A_rad × (T⁴ - T_sink⁴)
 </div>
 </Card>

 <Card title="Comms Link Budget & Ground Network">
 <p className="text-sm text-ink mb-2">
              Calculates line-of-sight slant range and antenna elevation angles across 5 real ground stations:
              Svalbard (78.2°N), Goldstone (35.4°N), Madrid (40.4°N), Canberra (35.4°S), and Troll (72.0°S).
 </p>
 </Card>
 </div>
 </section>
 </div>
 );
}
