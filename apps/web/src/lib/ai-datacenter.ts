/**
 * Orbital AI Data Center, Optical ISL Relay Constellation & Mission Phenomenology Engine.
 *
 * Bridges authoritative spacecraft telemetry with:
 * 1. Onboard Edge AI Compute Rack metrics (Neural TOPS, inference pipeline stages,
 *    vector compression ratios, EDAC radiation memory scrubbing, and radiator thermal coupling).
 * 2. 3-Node Optical Inter-Satellite Link (ISL, 1550 nm laser) Relay Constellation
 *    (LUMEN-RELAY-1..3) for low-latency alert routing across ground-station gaps.
 * 3. Scientific phenomenology & target theater metrics across all four missions:
 *    Wildfire Scout, Flood Scout, Volcano Watch, and Solar Storm Sentinel.
 */

import type { Telemetry, GameStateSummary } from "../types";

export interface ConstellationRelayNode {
  id: string;
  name: string;
  planeLabel: string;
  altitudeKm: number;
  inclinationDeg: number;
  raanDeg: number;
  phaseOffsetDeg: number;
  latitudeDeg: number;
  longitudeDeg: number;
  distanceKm: number;
  inCrosslinkRange: boolean;
  opticalDataRateGbps: number;
  downlinkAnchorStation: string;
}

export interface MissionPhenomenologyMetric {
  label: string;
  value: string;
  status: "nominal" | "warning" | "critical" | "highlight";
}

export interface MissionTheaterTarget {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
  severity: "CRITICAL" | "HIGH" | "MODERATE";
  primaryMetric: string;
  secondaryMetric: string;
}

export interface OrbitalAIDataCenterState {
  // Compute Rack & Neural Inference
  rackModelName: string;
  operationalMode: "FULL_INFERENCE" | "ECO_COMPRESSED" | "SAFE_RADIATION";
  peakTops: number;
  activeTops: number;
  utilizationPct: number;
  activePipelineName: string;
  pipelineStage: string;
  compressionRatio: number;
  aiVectorsGenerated: number;
  edacSeuScrubbed: number;

  // Thermal & Radiator Coupling
  computeHeatDrawW: number;
  radiatorRejectionW: number;
  radiatorLouverPct: number;
  coolantLoopTempC: number;
  thermalHeadroomC: number;

  // Optical ISL Constellation
  relayNodes: ConstellationRelayNode[];
  activeRelayNode: ConstellationRelayNode | null;
  opticalCrosslinkActive: boolean;

  // Mission-Specific Scientific Phenomenology
  sensorSuiteName: string;
  sensorBandSpec: string;
  phenomenologySummary: string;
  metrics: MissionPhenomenologyMetric[];
  primaryTargets: MissionTheaterTarget[];
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/** Great-circle + altitude chord distance in km between two orbital points. */
function orbitalChordDistanceKm(
  lat1: number,
  lon1: number,
  alt1Km: number,
  lat2: number,
  lon2: number,
  alt2Km: number
): number {
  const r1 = 6371 + alt1Km;
  const r2 = 6371 + alt2Km;
  const phi1 = lat1 * DEG_TO_RAD;
  const lam1 = lon1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const lam2 = lon2 * DEG_TO_RAD;

  const x1 = r1 * Math.cos(phi1) * Math.cos(lam1);
  const y1 = r1 * Math.sin(phi1);
  const z1 = r1 * Math.cos(phi1) * Math.sin(lam1);

  const x2 = r2 * Math.cos(phi2) * Math.cos(lam2);
  const y2 = r2 * Math.sin(phi2);
  const z2 = r2 * Math.cos(phi2) * Math.sin(lam2);

  return Math.hypot(x2 - x1, y2 - y1, z2 - z1);
}

/** Check whether line-of-sight between two satellites clears Earth's atmosphere (tangent > 80 km). */
function hasOpticalLineOfSight(
  lat1: number,
  lon1: number,
  alt1Km: number,
  lat2: number,
  lon2: number,
  alt2Km: number
): boolean {
  const r1 = 6371 + alt1Km;
  const r2 = 6371 + alt2Km;
  const phi1 = lat1 * DEG_TO_RAD;
  const lam1 = lon1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const lam2 = lon2 * DEG_TO_RAD;

  const p1 = [
    r1 * Math.cos(phi1) * Math.cos(lam1),
    r1 * Math.sin(phi1),
    r1 * Math.cos(phi1) * Math.sin(lam1),
  ];
  const p2 = [
    r2 * Math.cos(phi2) * Math.cos(lam2),
    r2 * Math.sin(phi2),
    r2 * Math.cos(phi2) * Math.sin(lam2),
  ];

  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const dz = p2[2] - p1[2];
  const lenSq = dx * dx + dy * dy + dz * dz;
  if (lenSq < 1e-6) return true;

  // Closest point parameter t along segment P1 -> P2 to Earth center (0,0,0)
  const t = Math.max(0, Math.min(1, -(p1[0] * dx + p1[1] * dy + p1[2] * dz) / lenSq));
  const cx = p1[0] + t * dx;
  const cy = p1[1] + t * dy;
  const cz = p1[2] + t * dz;
  const minRadiusKm = Math.hypot(cx, cy, cz);

  return minRadiusKm >= 6371 + 70; // Clears 70 km atmospheric limb
}

/** Compute deterministic 3-node Optical ISL Relay Constellation positions. */
export function computeConstellationRelayNodes(
  elapsedSeconds: number,
  satLatDeg: number,
  satLonDeg: number,
  satAltKm: number
): ConstellationRelayNode[] {
  const baseConfigs = [
    {
      id: "relay_alpha",
      name: "LUMEN-RELAY-1",
      planeLabel: "Plane A · Polar Trunk",
      altitudeKm: 1180,
      inclinationDeg: 86.4,
      raanDeg: 15,
      phaseOffsetDeg: 35,
      downlinkAnchorStation: "Svalbard Polar Gate",
    },
    {
      id: "relay_beta",
      name: "LUMEN-RELAY-2",
      planeLabel: "Plane B · Mid-Inclination",
      altitudeKm: 1220,
      inclinationDeg: 53.0,
      raanDeg: 135,
      phaseOffsetDeg: 155,
      downlinkAnchorStation: "Maspalomas / Wallops",
    },
    {
      id: "relay_gamma",
      name: "LUMEN-RELAY-3",
      planeLabel: "Plane C · Sun-Sync Relay",
      altitudeKm: 1150,
      inclinationDeg: 98.2,
      raanDeg: 255,
      phaseOffsetDeg: 275,
      downlinkAnchorStation: "Cordoba / Canberra",
    },
  ];

  // Mean motion at ~1180 km is ~109 min period (~0.055 deg/sec)
  const angularRateDegPerSec = 360 / 6540;
  const earthRotDegPerSec = 360 / 86164;

  return baseConfigs.map((cfg) => {
    const uRad = ((cfg.phaseOffsetDeg + elapsedSeconds * angularRateDegPerSec) % 360) * DEG_TO_RAD;
    const incRad = cfg.inclinationDeg * DEG_TO_RAD;
    const sinLat = Math.sin(incRad) * Math.sin(uRad);
    const latDeg = Math.asin(Math.max(-1, Math.min(1, sinLat))) * RAD_TO_DEG;

    const argLon = Math.atan2(Math.cos(incRad) * Math.sin(uRad), Math.cos(uRad)) * RAD_TO_DEG;
    const rawLon = cfg.raanDeg + argLon - elapsedSeconds * earthRotDegPerSec;
    const lonDeg = ((((rawLon + 180) % 360) + 360) % 360) - 180;

    const distanceKm = orbitalChordDistanceKm(
      satLatDeg,
      satLonDeg,
      satAltKm,
      latDeg,
      lonDeg,
      cfg.altitudeKm
    );
    const los = hasOpticalLineOfSight(
      satLatDeg,
      satLonDeg,
      satAltKm,
      latDeg,
      lonDeg,
      cfg.altitudeKm
    );
    const inCrosslinkRange = los && distanceKm <= 6800;
    const opticalDataRateGbps = inCrosslinkRange
      ? Number(Math.max(1.2, 10.0 * (1 - distanceKm / 8500)).toFixed(1))
      : 0;

    return {
      ...cfg,
      latitudeDeg: Number(latDeg.toFixed(2)),
      longitudeDeg: Number(lonDeg.toFixed(2)),
      distanceKm: Math.round(distanceKm),
      inCrosslinkRange,
      opticalDataRateGbps,
    };
  });
}

/** Mission-specific targets & scientific phenomenology definitions. */
export const MISSION_TARGETS_BY_SCENARIO: Record<string, MissionTheaterTarget[]> = {
  wildfire: [
    {
      id: "wf_nsw",
      name: "Blue Mountains Megafire",
      region: "New South Wales, Australia",
      lat: -33.7,
      lon: 150.3,
      severity: "CRITICAL",
      primaryMetric: "FRP 1,340 MW · Crown Fire",
      secondaryMetric: "Wind: 52 km/h NW · Smoke AOD 2.1",
    },
    {
      id: "wf_ca",
      name: "Sierra Nevada Complex",
      region: "California, USA",
      lat: 39.8,
      lon: -121.4,
      severity: "HIGH",
      primaryMetric: "FRP 890 MW · Rapid Spread",
      secondaryMetric: "Wind: 38 km/h NE · RH 11%",
    },
    {
      id: "wf_amz",
      name: "Southern Amazonia Front",
      region: "Mato Grosso, Brazil",
      lat: -9.8,
      lon: -63.1,
      severity: "HIGH",
      primaryMetric: "FRP 760 MW · Canopy Thermal",
      secondaryMetric: "Pyrocumulus Plume 6.2 km",
    },
    {
      id: "wf_med",
      name: "Attica Forest Corridor",
      region: "Greece / Aegean Basin",
      lat: 38.2,
      lon: 23.8,
      severity: "MODERATE",
      primaryMetric: "FRP 540 MW · WUI Interface",
      secondaryMetric: "Etesian Gale 45 km/h",
    },
  ],
  flood: [
    {
      id: "fl_bd",
      name: "Brahmaputra-Meghna Delta",
      region: "Sylhet & Dhaka Basin, Bangladesh",
      lat: 23.8,
      lon: 90.4,
      severity: "CRITICAL",
      primaryMetric: "Inundated: 4,850 km² · Crest +4.8m",
      secondaryMetric: "Cloud Cover 98% · SAR -19.2 dB",
    },
    {
      id: "fl_pk",
      name: "Lower Indus Floodplain",
      region: "Sindh Province, Pakistan",
      lat: 26.5,
      lon: 67.8,
      severity: "CRITICAL",
      primaryMetric: "Inundated: 6,120 km² · Levee Breach",
      secondaryMetric: "SAR Dual-Pol VV/VH Lock",
    },
    {
      id: "fl_ng",
      name: "Benue-Niger Confluence",
      region: "Lokoja Basin, Nigeria",
      lat: 7.8,
      lon: 6.7,
      severity: "HIGH",
      primaryMetric: "Inundated: 2,340 km² · Crest +3.4m",
      secondaryMetric: "AI Water-Mask 50:1 Active",
    },
  ],
  volcano: [
    {
      id: "vo_ic",
      name: "Reykjanes Fissure System",
      region: "Grindavik Peninsula, Iceland",
      lat: 63.9,
      lon: -22.4,
      severity: "CRITICAL",
      primaryMetric: "SO₂ Flux: 168 DU · Plume 11.8 km",
      secondaryMetric: "North Atlantic SIGMET Active",
    },
    {
      id: "vo_it",
      name: "Mount Etna SE Crater",
      region: "Sicily, Italy",
      lat: 37.75,
      lon: 14.99,
      severity: "CRITICAL",
      primaryMetric: "Thermal Anomaly: 1,120 MW",
      secondaryMetric: "Ash Column: 9.6 km ASL",
    },
    {
      id: "vo_jp",
      name: "Sakurajima Showa Vent",
      region: "Kyushu, Japan",
      lat: 31.59,
      lon: 130.66,
      severity: "HIGH",
      primaryMetric: "Explosive Paroxysm · SO₂ 132 DU",
      secondaryMetric: "Ballistic Ejecta + Ash Plume",
    },
    {
      id: "vo_id",
      name: "Mount Merapi Lava Dome",
      region: "Central Java, Indonesia",
      lat: -7.54,
      lon: 110.45,
      severity: "HIGH",
      primaryMetric: "Pyroclastic Flow · 780 MW",
      secondaryMetric: "Tropopause Plume Shear",
    },
  ],
  solar_storm: [
    {
      id: "ss_ar",
      name: "Arctic Magnetospheric Cusp",
      region: "Svalbard / Tromso Auroral Oval",
      lat: 74.0,
      lon: 18.0,
      severity: "CRITICAL",
      primaryMetric: "Kp = 7.8 (G4 Severe) · X2.8 Flare",
      secondaryMetric: "HF Blackout · GIC Grid Alert",
    },
    {
      id: "ss_an",
      name: "Antarctic Polar Horn",
      region: "Southern Auroral Curtain",
      lat: -71.5,
      lon: 140.0,
      severity: "CRITICAL",
      primaryMetric: "Proton Flux: 460 pfu (>10 MeV)",
      secondaryMetric: "SEU Rate: 0.48/day · EDAC Scrub",
    },
    {
      id: "ss_saa",
      name: "South Atlantic Anomaly Core",
      region: "Inner Van Allen Belt Dip",
      lat: -26.0,
      lon: -48.0,
      severity: "HIGH",
      primaryMetric: "Trapped Proton Peak · 18.5 rad/pass",
      secondaryMetric: "AI Neural Shielding Required",
    },
  ],
};

/** Compute full Orbital AI Data Center & Mission Phenomenology state from live telemetry. */
export function deriveOrbitalAIDataCenterState(
  scenarioId: string,
  telemetry: Telemetry | null,
  gameState: GameStateSummary | null
): OrbitalAIDataCenterState {
  const cleanScenario = scenarioId.replace(/_scout|_sentinel|_watch/g, "");
  const normalizedId =
    cleanScenario === "wildfire" ||
    cleanScenario === "flood" ||
    cleanScenario === "volcano" ||
    cleanScenario === "solar_storm"
      ? cleanScenario
      : scenarioId in MISSION_TARGETS_BY_SCENARIO
        ? scenarioId
        : "wildfire";

  const elapsed = telemetry?.elapsed_seconds ?? gameState?.elapsed_seconds ?? 0;
  const step = telemetry?.step ?? gameState?.step ?? 0;
  const satLat = telemetry?.orbital?.latitude_deg ?? 0;
  const satLon = telemetry?.orbital?.longitude_deg ?? 0;
  const satAlt = telemetry?.orbital?.altitude_km ?? 550;

  const rawProfile = telemetry?.workload?.operational_profile ?? "FULL";
  const operationalMode =
    rawProfile === "SAFE"
      ? "SAFE_RADIATION"
      : rawProfile === "ECO"
        ? "ECO_COMPRESSED"
        : "FULL_INFERENCE";

  const peakTops = 24.0;
  const cpuPct =
    telemetry?.workload?.cpu_usage_pct ??
    (operationalMode === "FULL_INFERENCE" ? 78 : operationalMode === "ECO_COMPRESSED" ? 44 : 18);
  const activeTops = Number(((peakTops * cpuPct) / 100).toFixed(1));

  const tempC = telemetry?.thermal?.temperature_c ?? 22.0;
  const radiatorRejectionW = Number((telemetry?.thermal?.heat_rejected_w ?? 185.0).toFixed(1));
  const computeHeatDrawW =
    operationalMode === "FULL_INFERENCE"
      ? 62.0
      : operationalMode === "ECO_COMPRESSED"
        ? 31.0
        : 12.0;
  const radiatorLouverPct = Math.min(100, Math.max(15, Math.round(((tempC - 5) / 50) * 100)));
  const thermalHeadroomC = Number(Math.max(0, 55.0 - tempC).toFixed(1));

  const relayNodes = computeConstellationRelayNodes(elapsed, satLat, satLon, satAlt);
  const activeRelayNode =
    relayNodes
      .filter((n) => n.inCrosslinkRange)
      .sort((a, b) => a.distanceKm - b.distanceKm)[0] ?? null;

  const collectedMb = telemetry?.comms?.data_collected_mb ?? gameState?.data_collected_mb ?? 0;
  const downlinkedMb = telemetry?.comms?.data_downlinked_mb ?? gameState?.data_downlinked_mb ?? 0;

  // Mission-specific pipeline & phenomenology
  const primaryTargets =
    MISSION_TARGETS_BY_SCENARIO[normalizedId] ?? MISSION_TARGETS_BY_SCENARIO.wildfire;

  if (normalizedId === "flood") {
    const compressionRatio = operationalMode === "SAFE_RADIATION" ? 15 : 50;
    const aiVectorsGenerated = Math.max(1, Math.round(collectedMb / 18));
    return {
      rackModelName: "Lumen-Edge-AI Quad NPU (Rad-Hard 7nm)",
      operationalMode,
      peakTops,
      activeTops,
      utilizationPct: Math.round(cpuPct),
      activePipelineName: "HydroMask-SAR v3.8 (U-Net Flood Polygonizer)",
      pipelineStage:
        operationalMode === "SAFE_RADIATION"
          ? "EDAC MEMORY SCRUBBING"
          : (telemetry?.comms?.data_buffer_mb ?? 0) > 20
            ? "SAR SPECKLE & 50:1 VECTOR COMPRESSION"
            : "C-BAND BACKSCATTER CALIBRATION",
      compressionRatio,
      aiVectorsGenerated,
      edacSeuScrubbed: Math.floor(step / 9),
      computeHeatDrawW,
      radiatorRejectionW,
      radiatorLouverPct,
      coolantLoopTempC: Number((tempC + 3.4).toFixed(1)),
      thermalHeadroomC,
      relayNodes,
      activeRelayNode,
      opticalCrosslinkActive: Boolean(activeRelayNode),
      sensorSuiteName: "C-Band Dual-Pol SAR (5.405 GHz)",
      sensorBandSpec: "VV/VH Co & Cross-Pol · 5m Swath",
      phenomenologySummary:
        "Active microwave radar penetrates 98% monsoon cloud cover; AI extracts specular water masks (-18.5 dB) at 50:1 compression.",
      metrics: [
        { label: "Monsoon Cloud Cover", value: "97% (SAR Penetrating)", status: "highlight" },
        { label: "Inundated Basin Area", value: `${(4280 + step * 14).toLocaleString()} km²`, status: "warning" },
        { label: "River Gauge Crest", value: `+${(4.2 + (step % 8) * 0.1).toFixed(1)} m Flood Stage`, status: "critical" },
        { label: "AI Vector Compression", value: `${compressionRatio}:1 (GeoJSON Mask)`, status: "nominal" },
      ],
      primaryTargets,
    };
  }

  if (normalizedId === "volcano") {
    const compressionRatio = operationalMode === "SAFE_RADIATION" ? 10 : 22;
    const aiVectorsGenerated = Math.max(1, Math.round((collectedMb + downlinkedMb) / 22));
    return {
      rackModelName: "Lumen-Edge-AI Quad NPU (Rad-Hard 7nm)",
      operationalMode,
      peakTops,
      activeTops,
      utilizationPct: Math.round(cpuPct),
      activePipelineName: "PlumeCast-UV/IR v2.9 (SO₂ + Ash Transformer)",
      pipelineStage:
        tempC > 42
          ? "OPTICS SHUTTER THERMAL GUARD"
          : "UV-DOAS SO₂ & ASH ALTITUDE INFERENCE",
      compressionRatio,
      aiVectorsGenerated,
      edacSeuScrubbed: Math.floor(step / 8),
      computeHeatDrawW,
      radiatorRejectionW,
      radiatorLouverPct,
      coolantLoopTempC: Number((tempC + 3.8).toFixed(1)),
      thermalHeadroomC,
      relayNodes,
      activeRelayNode,
      opticalCrosslinkActive: Boolean(activeRelayNode),
      sensorSuiteName: "TIR Caldera Imager + UV-DOAS Spectrometer",
      sensorBandSpec: "310–340 nm UV SO₂ + 10.8 µm TIR",
      phenomenologySummary:
        "Tracks pre-eruptive caldera thermal flux and stratospheric SO₂/silicate ash corridors to issue ICAO Aviation SIGMET advisories.",
      metrics: [
        { label: "Caldera Thermal Flux", value: `${890 + (step % 12) * 25} MW`, status: "critical" },
        { label: "SO₂ Column Density", value: `${142 + (step % 9) * 4} DU (Dobson)`, status: "warning" },
        { label: "Ash Plume Top", value: `${(10.8 + (step % 6) * 0.2).toFixed(1)} km ASL`, status: "warning" },
        { label: "Aviation Corridor", value: "SIGMET RED · 3 Flights Rerouted", status: "highlight" },
      ],
      primaryTargets,
    };
  }

  if (normalizedId === "solar_storm") {
    const compressionRatio = 12;
    const kpIndex = Math.min(8.9, 6.8 + ((step % 10) * 0.18));
    const seuCount = Math.max(1, Math.floor(step / 3) + (telemetry?.radiation_debris?.in_saa_zone ? 3 : 0));
    return {
      rackModelName: "Lumen-Edge-AI Quad NPU (TMR Rad-Shielded)",
      operationalMode,
      peakTops,
      activeTops,
      utilizationPct: Math.round(cpuPct),
      activePipelineName: "HelioShield-MHD v5.1 (CME Shockwave + EDAC)",
      pipelineStage:
        operationalMode === "SAFE_RADIATION"
          ? "TMR LOCKSTEP + EDAC BITFLIP SCRUB"
          : "CORONAGRAPH CME VELOCITY TRACKING",
      compressionRatio,
      aiVectorsGenerated: Math.max(1, Math.round((collectedMb + 20) / 16)),
      edacSeuScrubbed: seuCount,
      computeHeatDrawW,
      radiatorRejectionW,
      radiatorLouverPct,
      coolantLoopTempC: Number((tempC + 2.9).toFixed(1)),
      thermalHeadroomC,
      relayNodes,
      activeRelayNode,
      opticalCrosslinkActive: Boolean(activeRelayNode),
      sensorSuiteName: "EUV Solar Coronagraph + Proton Magnetometer",
      sensorBandSpec: "19.3 nm EUV + >10 MeV Proton Detector",
      phenomenologySummary:
        "Monitors X-class solar flares and Earth-directed CMEs while scrubbing high-energy proton Single-Event Upsets (SEUs) in orbital AI memory.",
      metrics: [
        { label: "Planetary Kp Index", value: `Kp = ${kpIndex.toFixed(1)} (G3–G4 Storm)`, status: "critical" },
        { label: "CME Shock Velocity", value: `${1380 + (step % 7) * 35} km/s`, status: "warning" },
        { label: "Auroral Oval Boundary", value: `${(53.5 - (kpIndex - 6.5) * 1.8).toFixed(1)}° Mag Lat`, status: "highlight" },
        { label: "EDAC SEUs Scrubbed", value: `${seuCount} Bitflips Corrected`, status: "nominal" },
      ],
      primaryTargets,
    };
  }

  // Default: Wildfire Scout
  const compressionRatio = operationalMode === "SAFE_RADIATION" ? 12 : 25;
  const aiVectorsGenerated = Math.max(1, Math.round((collectedMb + 15) / 15));
  return {
    rackModelName: "Lumen-Edge-AI Quad NPU (Rad-Hard 7nm)",
    operationalMode,
    peakTops,
    activeTops,
    utilizationPct: Math.round(cpuPct),
    activePipelineName: "FireNet-SWIR v4.2 (Hotspot CNN + Wind Vector)",
    pipelineStage:
      operationalMode === "SAFE_RADIATION"
        ? "EDAC STANDBY"
        : (telemetry?.comms?.data_buffer_mb ?? 0) > 15
          ? "FIRE PERIMETER VECTOR EXTRACTION"
          : "3.9 µm SWIR SMOKE PENETRATION",
    compressionRatio,
    aiVectorsGenerated,
    edacSeuScrubbed: Math.floor(step / 10),
    computeHeatDrawW,
    radiatorRejectionW,
    radiatorLouverPct,
    coolantLoopTempC: Number((tempC + 3.6).toFixed(1)),
    thermalHeadroomC,
    relayNodes,
    activeRelayNode,
    opticalCrosslinkActive: Boolean(activeRelayNode),
    sensorSuiteName: "Multispectral SWIR/MWIR Thermal Imager",
    sensorBandSpec: "3.9 µm Hotspot + 10.8 µm Thermal Band",
    phenomenologySummary:
      "Penetrates dense biomass smoke plumes in the 3.9 µm window to quantify Fire Radiative Power (FRP) and forecast wind-driven fire fronts.",
    metrics: [
      { label: "Peak Fire Radiative Power", value: `${1180 + (step % 11) * 30} MW`, status: "critical" },
      { label: "Smoke Optical Depth", value: "AOD 1.92 (SWIR Clear)", status: "highlight" },
      { label: "Fire-Front Wind Vector", value: `${44 + (step % 6) * 2} km/h NW`, status: "warning" },
      { label: "AI Perimeter Compression", value: `${compressionRatio}:1 GeoJSON Vector`, status: "nominal" },
    ],
    primaryTargets,
  };
}

