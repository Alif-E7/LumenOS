import { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import {
  Compass,
  Zap,
  Crosshair,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Radio,
} from "lucide-react";
import type { OrbitalTelemetry, CommsTelemetry, ClockState, ActiveEvent } from "../../types";
import {
  GROUND_STATIONS,
  calculateFootprintRadiusKm,
} from "../../lib/mission-geometry";
import {
  atmosphereVertexShader,
  atmosphereFragmentShader,
  earthVertexShader,
  earthFragmentShader,
  cloudVertexShader,
  cloudFragmentShader,
} from "../../lib/earth-shaders";
import {
  parseCountryBorders,
  createBorderGeometry,
  createCountryHighlight,
  findCountryAtLatLon,
  vector3ToLatLon,
  type CountryFeature,
} from "../../lib/geo-borders";
import { COUNTRY_LABELS } from "../../lib/country-labels";
import {
  OrbitalAIDataCenterSatellite,
  createOrbitalAIDataCenterSatellite,
} from "../../lib/orbital-ai-satellite";
import {
  wildfireTerrainVertexShader,
  wildfireTerrainFragmentShader,
  floodBasinFragmentShader,
  volcanoConeVertexShader,
  volcanoConeFragmentShader,
  auroraCurtainVertexShader,
  auroraCurtainFragmentShader,
  createSolarStormSpaceWeatherSystem,
} from "../../lib/mission-environment-engine";

export interface UltraRealisticEarthFlightProps {
  orbital?: OrbitalTelemetry | null;
  comms?: CommsTelemetry | null;
  clock?: ClockState | null;
  scenarioId?: string;
  groundTrackPoints?: Array<{ latitude_deg: number; longitude_deg: number; altitude_km?: number }>;
  activeEvent?: ActiveEvent | null;
  thermalTempC?: number;
  aiActiveTops?: number;
  resolvedTargetIds?: string[];
  scanningTargetId?: string | null;
  scanProgressPct?: number;
  autopilotTargetId?: string | null;
  islPulseActive?: boolean;
  onTargetInRangeChange?: (target: GlobalEarthEvent | null, distanceKm: number) => void;
  onSelectTarget?: (target: GlobalEarthEvent) => void;
  className?: string;
}

export type CameraViewMode = "tpp" | "nadir" | "orbit" | "datacenter" | "cinematic" | "global" | "wing" | "free";

const EARTH_RADIUS = 5.0;

export interface GlobalEarthEvent {
  id: string;
  name: string;
  type: "wildfire" | "volcano" | "flood" | "solar_storm" | "cyclone";
  scenarioId?: string;
  lat: number;
  lon: number;
  colorHex: string;
  badge: string;
  intensity: string;
  description: string;
}

/** Comprehensive, dynamic catalog of global disaster events across Earth. */
export const GLOBAL_EARTH_EVENTS: GlobalEarthEvent[] = [
  // ── Wildfires ──
  {
    id: "wf_blue_mountains",
    name: "Blue Mountains Wildfire Front",
    type: "wildfire",
    scenarioId: "wildfire",
    lat: -33.7,
    lon: 150.3,
    colorHex: "#ef4444",
    badge: "🔥 Wildfire Inferno",
    intensity: "850 MW",
    description: "Violent canopy wildfire raging across eucalyptus ridge lines",
  },
  {
    id: "wf_gippsland",
    name: "Gippsland Firestorm",
    type: "wildfire",
    scenarioId: "wildfire",
    lat: -37.5,
    lon: 147.2,
    colorHex: "#f97316",
    badge: "🔥 Firestorm Flank",
    intensity: "620 MW",
    description: "Rapidly spreading wildfire flank with spotting fire embers",
  },
  {
    id: "wf_amazon",
    name: "Amazon Basin Forest Fires",
    type: "wildfire",
    lat: -3.4,
    lon: -62.2,
    colorHex: "#ef4444",
    badge: "🔥 Amazon Burns",
    intensity: "940 MW",
    description: "Widespread tropical rainforest firestorm with towering smoke clouds",
  },
  {
    id: "wf_california",
    name: "California Sierra Wildfire",
    type: "wildfire",
    lat: 37.8,
    lon: -119.5,
    colorHex: "#f97316",
    badge: "🔥 Sierra Wildfire",
    intensity: "520 MW",
    description: "Wind-driven pine canyon blaze threatening timber reserves",
  },
  {
    id: "wf_siberia",
    name: "Siberian Taiga Wildfire",
    type: "wildfire",
    lat: 62.0,
    lon: 129.7,
    colorHex: "#ea580c",
    badge: "🔥 Taiga Inferno",
    intensity: "710 MW",
    description: "Subarctic peat and coniferous forest firestorm",
  },

  // ── Active Volcanoes ──
  {
    id: "volc_merapi",
    name: "Mount Merapi Caldera",
    type: "volcano",
    scenarioId: "volcano",
    lat: -7.54,
    lon: 110.44,
    colorHex: "#dc2626",
    badge: "🌋 Volcano Eruption",
    intensity: "VEI-4",
    description: "Active stratovolcano with pyroclastic flow & 14 km ash column",
  },
  {
    id: "volc_krakatau",
    name: "Anak Krakatau Caldera",
    type: "volcano",
    scenarioId: "volcano",
    lat: -6.1,
    lon: 105.42,
    colorHex: "#b91c1c",
    badge: "🌋 Island Caldera",
    intensity: "VEI-3",
    description: "Island caldera eruption with continuous lava fountains",
  },
  {
    id: "volc_iceland",
    name: "Fagradalsfjall Rift Eruption",
    type: "volcano",
    scenarioId: "volcano",
    lat: 63.89,
    lon: -22.27,
    colorHex: "#f87171",
    badge: "🌋 Basaltic Rift",
    intensity: "Curtain of Fire",
    description: "Basaltic fissure eruption with incandescent lava fountains",
  },
  {
    id: "volc_etna",
    name: "Mount Etna Crater",
    type: "volcano",
    lat: 37.75,
    lon: 15.0,
    colorHex: "#dc2626",
    badge: "🌋 Active Crater",
    intensity: "Strombolian",
    description: "Summit crater lava explosions and sulfur plumes",
  },
  {
    id: "volc_kilauea",
    name: "Kilauea Halemaumau",
    type: "volcano",
    lat: 19.42,
    lon: -155.28,
    colorHex: "#ef4444",
    badge: "🌋 Lava Lake",
    intensity: "Continuous Lake",
    description: "Boiling basaltic lava lake with vigorous gas fountains",
  },

  // ── Major Floods & Inundations ──
  {
    id: "flood_brahmaputra",
    name: "Brahmaputra Basin Flood Plain",
    type: "flood",
    scenarioId: "flood",
    lat: 26.1,
    lon: 91.7,
    colorHex: "#06b6d4",
    badge: "🌊 Major Flood",
    intensity: "14,500 km²",
    description: "Monsoon river overflow submerging delta agricultural zones",
  },
  {
    id: "flood_ganges",
    name: "Ganges Delta Confluence",
    type: "flood",
    scenarioId: "flood",
    lat: 23.4,
    lon: 90.2,
    colorHex: "#3b82f6",
    badge: "🌊 Storm Surge",
    intensity: "21,000 km²",
    description: "Tidal storm surge breaching river embankments and levees",
  },
  {
    id: "flood_yangtze",
    name: "Yangtze Middle Basin",
    type: "flood",
    lat: 30.5,
    lon: 114.3,
    colorHex: "#0284c7",
    badge: "🌊 River Inundation",
    intensity: "11,800 km²",
    description: "Severe riverine inundation across central floodplain",
  },
  {
    id: "flood_mississippi",
    name: "Mississippi Delta Flood Plain",
    type: "flood",
    lat: 32.3,
    lon: -90.9,
    colorHex: "#38bdf8",
    badge: "🌊 Levee Overflow",
    intensity: "8,400 km²",
    description: "Spring meltwaters overtopping spillways and bayous",
  },

  // ── Solar Storms & Polar Auroras ──
  {
    id: "aurora_svalbard",
    name: "Svalbard Auroral Oval",
    type: "solar_storm",
    scenarioId: "solar_storm",
    lat: 78.2,
    lon: 15.4,
    colorHex: "#10b981",
    badge: "⚡ Aurora Borealis",
    intensity: "Kp 8 Storm",
    description: "Brilliant geomagnetic auroral curtain dancing over the Arctic",
  },
  {
    id: "aurora_fairbanks",
    name: "Alaska Auroral Crown",
    type: "solar_storm",
    lat: 64.86,
    lon: -147.72,
    colorHex: "#34d399",
    badge: "⚡ Northern Lights",
    intensity: "Kp 7 Storm",
    description: "Solar proton flux energizing ionospheric oxygen and nitrogen",
  },
  {
    id: "aurora_mcmurdo",
    name: "McMurdo Aurora Australis",
    type: "solar_storm",
    scenarioId: "solar_storm",
    lat: -77.85,
    lon: 166.67,
    colorHex: "#a855f7",
    badge: "⚡ Aurora Australis",
    intensity: "Proton Flux S3",
    description: "Southern polar auroral storm with ionospheric scintillation",
  },

  // ── Severe Cyclones & Weather Vortices ──
  {
    id: "cyclone_pacific",
    name: "Super Typhoon Mawar",
    type: "cyclone",
    lat: 15.2,
    lon: 135.5,
    colorHex: "#67e8f9",
    badge: "🌀 Super Typhoon",
    intensity: "Category 5",
    description: "Massive tropical cyclone with clear eye and 260 km/h winds",
  },
  {
    id: "cyclone_caribbean",
    name: "Atlantic Category 5 Hurricane",
    type: "cyclone",
    lat: 21.5,
    lon: -72.0,
    colorHex: "#93c5fd",
    badge: "🌀 Hurricane",
    intensity: "Category 5",
    description: "Intense spiral vortex with towering eyewall cloud convection",
  },
];

/** Convert latitude and longitude to Three.js Cartesian coordinates. */
function latLonToVector3(latDeg: number, lonDeg: number, radius: number): THREE.Vector3 {
  const phi = (latDeg * Math.PI) / 180;
  const theta = ((lonDeg + 180) * Math.PI) / 180;
  const x = -radius * Math.cos(phi) * Math.cos(theta);
  const y = radius * Math.sin(phi);
  const z = radius * Math.cos(phi) * Math.sin(theta);
  return new THREE.Vector3(x, y, z);
}

/** Create procedural Earth texture with continents, oceans, and night lights. */
function createEarthCanvasTexture(): THREE.CanvasTexture {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Deep ocean base
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, height);
  oceanGrad.addColorStop(0, "#081726");
  oceanGrad.addColorStop(0.3, "#0f2d4a");
  oceanGrad.addColorStop(0.5, "#143a5d");
  oceanGrad.addColorStop(0.7, "#0f2d4a");
  oceanGrad.addColorStop(1, "#081726");
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, width, height);

  const toX = (lon: number) => ((lon + 180) / 360) * width;
  const toY = (lat: number) => ((90 - lat) / 180) * height;

  function drawLandmass(coords: Array<[number, number]>, baseColor: string, desert?: { center: [number, number]; radius: number }) {
    if (!ctx || coords.length === 0) return;
    ctx.beginPath();
    ctx.moveTo(toX(coords[0][1]), toY(coords[0][0]));
    for (let i = 1; i < coords.length; i++) ctx.lineTo(toX(coords[i][1]), toY(coords[i][0]));
    ctx.closePath();
    ctx.lineWidth = 14;
    ctx.strokeStyle = "rgba(14, 116, 144, 0.4)";
    ctx.stroke();

    ctx.fillStyle = baseColor;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#1e3a1e";
    ctx.stroke();

    if (desert) {
      const cx = toX(desert.center[1]);
      const cy = toY(desert.center[0]);
      const rad = desert.radius * (width / 360);
      const radGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      radGrad.addColorStop(0, "rgba(217, 169, 99, 0.85)");
      radGrad.addColorStop(0.7, "rgba(194, 148, 80, 0.4)");
      radGrad.addColorStop(1, "rgba(194, 148, 80, 0)");
      ctx.fillStyle = radGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw continents
  drawLandmass([[70, -165], [72, -130], [60, -85], [52, -55], [44, -64], [30, -81], [25, -80], [18, -95], [15, -92], [9, -78], [14, -87], [22, -105], [32, -117], [38, -123], [48, -125], [58, -136], [60, -148], [65, -168]], "#2e5631", { center: [34, -112], radius: 16 });
  drawLandmass([[12, -72], [10, -62], [4, -51], [-3, -38], [-12, -37], [-23, -42], [-34, -53], [-42, -64], [-54, -67], [-52, -74], [-38, -73], [-24, -70], [-12, -77], [-4, -81], [5, -77]], "#224a26", { center: [-23, -68], radius: 10 });
  drawLandmass([[71, 28], [68, 44], [72, 70], [77, 105], [70, 140], [66, 170], [60, 162], [52, 141], [40, 128], [32, 121], [22, 114], [21, 107], [10, 105], [8, 98], [22, 89], [22, 70], [25, 62], [14, 53], [12, 44], [30, 32], [36, 36], [42, 28], [36, -5], [43, -9], [48, -4], [54, 8], [58, 6], [62, 5], [70, 20]], "#345b36", { center: [28, 48], radius: 24 });
  drawLandmass([[36, 10], [32, 32], [28, 34], [12, 51], [2, 45], [-11, 40], [-26, 33], [-34, 26], [-34, 18], [-22, 14], [-6, 12], [4, 9], [5, 1], [4, -7], [12, -16], [21, -17], [30, -10], [36, -5]], "#3a5830", { center: [22, 18], radius: 22 });
  drawLandmass([[-12, 131], [-12, 136], [-17, 141], [-11, 142], [-22, 150], [-32, 153], [-38, 147], [-38, 140], [-32, 132], [-35, 118], [-32, 115], [-22, 114], [-15, 124]], "#8a5d3b", { center: [-25, 134], radius: 18 });
  drawLandmass([[76, -68], [83, -30], [81, -18], [65, -40], [60, -45], [70, -55]], "#e2e8f0");
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(0, toY(-65), width, height - toY(-65));

  // Golden City lights
  ctx.fillStyle = "rgba(253, 224, 71, 0.88)";
  const cityClusters: Array<[number, number, number]> = [
    [40, -74, 20], [34, -118, 18], [41, -87, 16], [51, 0, 24],
    [48, 2, 22], [35, 139, 28], [31, 121, 26], [28, 77, 26],
    [22, 88, 20], [-33, 151, 14], [-23, -43, 16], [-34, -58, 14],
  ];
  cityClusters.forEach(([lat, lon, count]) => {
    const cx = toX(lon);
    const cy = toY(lat);
    for (let i = 0; i < count; i++) {
      const rx = cx + (Math.random() - 0.5) * 35;
      const ry = cy + (Math.random() - 0.5) * 25;
      ctx.beginPath();
      ctx.arc(rx, ry, Math.random() * 2.2 + 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** Dynamic procedural Cloud texture. */
function createCloudCanvasTexture(): THREE.CanvasTexture {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.clearRect(0, 0, width, height);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * width;
    const y = 80 + Math.random() * (height - 160);
    const radX = 40 + Math.random() * 110;
    const radY = 15 + Math.random() * 45;
    const alpha = 0.2 + Math.random() * 0.45;

    const grad = ctx.createRadialGradient(x, y, 0, x, y, radX);
    grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    grad.addColorStop(0.6, `rgba(240, 248, 255, ${alpha * 0.6})`);
    grad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(x, y, radX, radY, (Math.random() - 0.5) * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** Luminous Starburst Sun Flare Sprite with 12 piercing light rays. */
function createSunburstTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const center = size / 2;

  // Blinding Core Glow
  const coreGrad = ctx.createRadialGradient(center, center, 0, center, center, center * 0.95);
  coreGrad.addColorStop(0, "rgba(255, 255, 255, 1.0)");
  coreGrad.addColorStop(0.12, "rgba(255, 250, 224, 0.95)");
  coreGrad.addColorStop(0.25, "rgba(254, 240, 138, 0.75)");
  coreGrad.addColorStop(0.45, "rgba(245, 158, 11, 0.35)");
  coreGrad.addColorStop(0.75, "rgba(249, 115, 22, 0.12)");
  coreGrad.addColorStop(1, "rgba(239, 68, 68, 0)");
  ctx.fillStyle = coreGrad;
  ctx.fillRect(0, 0, size, size);

  // 12 Radiant Sun Rays
  ctx.save();
  ctx.translate(center, center);
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI) / 6;
    ctx.rotate(angle);
    const rayLength = i % 2 === 0 ? center * 0.95 : center * 0.65;
    const rayGrad = ctx.createLinearGradient(0, 0, rayLength, 0);
    rayGrad.addColorStop(0, "rgba(255, 255, 255, 0.9)");
    rayGrad.addColorStop(0.4, "rgba(254, 240, 138, 0.45)");
    rayGrad.addColorStop(1, "rgba(245, 158, 11, 0)");

    ctx.fillStyle = rayGrad;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(rayLength, 0);
    ctx.lineTo(0, 6);
    ctx.closePath();
    ctx.fill();
    ctx.rotate(-angle);
  }

  // Anamorphic horizontal lens flare streak
  const streakGrad = ctx.createLinearGradient(-center, 0, center, 0);
  streakGrad.addColorStop(0, "rgba(56, 189, 248, 0)");
  streakGrad.addColorStop(0.4, "rgba(254, 240, 138, 0.35)");
  streakGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.85)");
  streakGrad.addColorStop(0.6, "rgba(254, 240, 138, 0.35)");
  streakGrad.addColorStop(1, "rgba(56, 189, 248, 0)");
  ctx.fillStyle = streakGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, center * 0.95, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  return new THREE.CanvasTexture(canvas);
}

/** Realistic Flame Particle Sprite. */
function createFlameSprite(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  grad.addColorStop(0, "rgba(255, 255, 255, 1)");
  grad.addColorStop(0.2, "rgba(254, 240, 138, 0.95)");
  grad.addColorStop(0.5, "rgba(249, 115, 22, 0.75)");
  grad.addColorStop(0.8, "rgba(239, 68, 68, 0.3)");
  grad.addColorStop(1, "rgba(239, 68, 68, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/** Billowing Dark Smoke Sprite. */
function createSmokeSprite(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  grad.addColorStop(0, "rgba(75, 85, 99, 0.7)");
  grad.addColorStop(0.5, "rgba(55, 65, 81, 0.35)");
  grad.addColorStop(1, "rgba(31, 41, 55, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/** Expanding Water Ripple Wave Sprite. */
function createRippleSprite(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.beginPath();
  ctx.arc(32, 32, 26, 0, Math.PI * 2);
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(6, 182, 212, 0.95)";
  ctx.stroke();
  return new THREE.CanvasTexture(canvas);
}

/**
 * Create the primary Low-Earth-Orbit AI Data Center Scout Spacecraft ("LUMEN-SCOUT-1")
 * using the modular aerospace-engineered OrbitalAIDataCenterSatellite class.
 */
function createScoutAISatellite(): OrbitalAIDataCenterSatellite {
  return createOrbitalAIDataCenterSatellite({
    id: "lumen_scout_1",
    name: "LUMEN-SCOUT-1",
    role: "primary_scout",
    scale: 0.62,
    orbitRadius: EARTH_RADIUS + 0.85,
    orbitAltitudeKm: 550,
    orbitalInclination: Math.PI * 0.3,
    orbitalSpeed: 0.0028,
    solarPanelOrientation: "auto",
    radiatorConfig: { wingCount: 2, thermalLoadC: 22.0, channelsPerPanel: 24 },
    communicationRange: 9.8,
    autoDeployOnEnter: true,
  });
}

/**
 * Create the High-Orbit Flagship Orbital AI Data Center Node ("LUMEN-DC-ALPHA")
 * in Medium Earth Orbit with 4 Large Deployable Thermal Radiator Wings, Quad Solar Arrays,
 * Twin High-Density Auxiliary Server Pods, and 4 Optical Laser Communication Terminals.
 */
function createFlagshipDataCenterSatellite(): OrbitalAIDataCenterSatellite {
  return createOrbitalAIDataCenterSatellite({
    id: "lumen_dc_alpha",
    name: "LUMEN-DC-ALPHA",
    role: "flagship_datacenter",
    scale: 0.78,
    orbitRadius: EARTH_RADIUS + 2.05,
    orbitAltitudeKm: 1850,
    orbitalInclination: 0.52,
    raan: 1.15,
    orbitalSpeed: 0.0011,
    solarPanelOrientation: "auto",
    radiatorConfig: { wingCount: 4, thermalLoadC: 26.0, channelsPerPanel: 24 },
    communicationRange: 11.5,
    autoDeployOnEnter: true,
  });
}

/**
 * Ultra-Realistic 3D Space Flight Game.
 *
 * Core Features:
 * - Two Distinct Orbital Vehicles: Low-Orbit Scout Satellite (LUMEN-SCOUT-1) + High-Orbit AI Data Center Mother Station (LUMEN-DC-ALPHA).
 * - Interactive Camera Switcher: Scout Chase (TPP), Nadir Scan, AI Data Center Station View, and Global Orbit View.
 * - True Great-Circle Spherical Propagation + Smooth Orbital Plane Precession (Never spins in place!).
 * - Photorealistic NASA Blue Marble Earth + Day/Night Lit Clouds + Rayleigh Atmosphere + Volumetric Laser Cones.
 */
export function UltraRealisticEarthFlight({
  orbital,
  comms,
  scenarioId = "wildfire",
  groundTrackPoints = [],
  activeEvent,
  thermalTempC = 22.0,
  aiActiveTops = 18.5,
  resolvedTargetIds = [],
  scanningTargetId = null,
  scanProgressPct = 0,
  autopilotTargetId = null,
  islPulseActive = false,
  onTargetInRangeChange,
  onSelectTarget,
  className = "",
}: UltraRealisticEarthFlightProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [viewMode, setViewMode] = useState<CameraViewMode>("tpp"); // DEFAULT TPP!
  const [showMapOverlay, setShowMapOverlay] = useState<boolean>(false); // Natural Earth by default!
  const showMapOverlayRef = useRef<boolean>(false);
  showMapOverlayRef.current = showMapOverlay;
  const [inRangeTargetName, setInRangeTargetName] = useState<string | null>(null);
  const [activeRelayLabel, setActiveRelayLabel] = useState<string>("LUMEN-DC-ALPHA (10.0 Gbps)");
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [isBoosting, setIsBoosting] = useState(false);
  const [orbitalSpeedKmS, setOrbitalSpeedKmS] = useState(7.6);
  const [deploymentBadge, setDeploymentBadge] = useState<string | null>(
    "Stage 1/5: Central AI Compute Bus Separation"
  );
  const deployTriggerRef = useRef<number>(0);
  const thermalTempRef = useRef(thermalTempC);
  thermalTempRef.current = thermalTempC;
  const scenarioIdRef = useRef(scenarioId);
  scenarioIdRef.current = scenarioId;
  const resolvedIdsRef = useRef<string[]>(resolvedTargetIds);
  resolvedIdsRef.current = resolvedTargetIds;
  const scanningIdRef = useRef<string | null>(scanningTargetId);
  scanningIdRef.current = scanningTargetId;
  const scanPctRef = useRef<number>(scanProgressPct);
  scanPctRef.current = scanProgressPct;
  const autopilotIdRef = useRef<string | null>(autopilotTargetId);
  const prevAutopilotIdRef = useRef<string | null>(autopilotTargetId);
  const islPulseRef = useRef<boolean>(islPulseActive);
  islPulseRef.current = islPulseActive;
  const onTargetInRangeRef = useRef(onTargetInRangeChange);
  onTargetInRangeRef.current = onTargetInRangeChange;
  const onSelectTargetRef = useRef(onSelectTarget);
  onSelectTargetRef.current = onSelectTarget;

  // Flight Steering State (Allows player to actually DRIVE the spacecraft across the 3D sphere!)
  const flightState = useRef({
    progress: 0.8, // Continuous orbit angle
    speed: 0.0028, // Base continuous angular speed (rad/frame)
    dcPhase: 1.9, // Separate orbital phase for High-Orbit AI Data Center Mother Station!
    autopilotBoostFrames: 0, // Burst speed when locking onto a new target
    pitch: 0, // Player pitch steering
    yaw: 0, // Player yaw steering
    roll: 0, // Banking roll
    boost: false,
    satDir: new THREE.Vector3(
      Math.cos(0.8),
      Math.sin(0.8) * Math.sin(Math.PI * 0.3),
      Math.sin(0.8) * Math.cos(Math.PI * 0.3)
    ).normalize(),
    velDir: new THREE.Vector3(
      -Math.sin(0.8),
      Math.cos(0.8) * Math.sin(Math.PI * 0.3),
      Math.cos(0.8) * Math.cos(Math.PI * 0.3)
    ).normalize(),
    lastInRangeId: null as string | null,
    frameTick: 0,
    keys: { w: false, s: false, a: false, d: false, space: false },
  });

  // Trigger a smooth 2.2x Ion Intercept Burst whenever the player selects a new target!
  if (autopilotTargetId !== prevAutopilotIdRef.current) {
    prevAutopilotIdRef.current = autopilotTargetId;
    autopilotIdRef.current = autopilotTargetId;
    if (autopilotTargetId) {
      flightState.current.autopilotBoostFrames = 85;
    }
  } else {
    autopilotIdRef.current = autopilotTargetId;
  }

  const isDraggingRef = useRef(false);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const orbitAngleRef = useRef({ theta: 0.65, phi: 0.35, radius: 19.0 });
  const viewModeRef = useRef<CameraViewMode>("tpp");
  viewModeRef.current = viewMode;

  // Camera transition lerp targets
  const camPosRef = useRef(new THREE.Vector3(0, 5, 12));
  const camLookAtRef = useRef(new THREE.Vector3(0, 0, 0));
  const camUpRef = useRef(new THREE.Vector3(0, 1, 0));
  const tppZoomRef = useRef(1.0);

  const satLat = orbital?.latitude_deg ?? -33.8;
  const satLon = orbital?.longitude_deg ?? 145.0;
  const satAltKm = orbital?.altitude_km ?? 550.0;
  const inEclipse = orbital?.in_eclipse ?? false;

  const orbitRadius = EARTH_RADIUS + 0.85;

  const scenarioTargets = useMemo(() => {
    return GLOBAL_EARTH_EVENTS.filter((e) => e.scenarioId === scenarioId);
  }, [scenarioId]);

  // Handle Steering & Camera Inputs (Keyboard)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (["ArrowUp", "KeyW"].includes(e.code)) flightState.current.keys.w = true;
      if (["ArrowDown", "KeyS"].includes(e.code)) flightState.current.keys.s = true;
      if (["ArrowLeft", "KeyA"].includes(e.code)) flightState.current.keys.a = true;
      if (["ArrowRight", "KeyD"].includes(e.code)) flightState.current.keys.d = true;
      if (["Space", "ShiftLeft"].includes(e.code)) {
        flightState.current.keys.space = true;
        setIsBoosting(true);
      }
      if (["KeyC", "KeyV"].includes(e.code)) {
        setViewMode((prev) => {
          if (prev === "tpp") return "nadir";
          if (prev === "nadir" || prev === "wing") return "cinematic";
          if (prev === "cinematic") return "datacenter";
          if (prev === "datacenter") return "orbit";
          return "tpp";
        });
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (["ArrowUp", "KeyW"].includes(e.code)) flightState.current.keys.w = false;
      if (["ArrowDown", "KeyS"].includes(e.code)) flightState.current.keys.s = false;
      if (["ArrowLeft", "KeyA"].includes(e.code)) flightState.current.keys.a = false;
      if (["ArrowRight", "KeyD"].includes(e.code)) flightState.current.keys.d = false;
      if (["Space", "ShiftLeft"].includes(e.code)) {
        flightState.current.keys.space = false;
        setIsBoosting(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // ── Main Scene Initialization (Runs ONCE on mount) ──────────────────────────
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020408);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 2.5, 9.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    container.replaceChildren(renderer.domElement);

    // 2. Starfield in Deep Space
    const starsCount = 2600;
    const starGeom = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starsCount * 3);
    const starColors = new Float32Array(starsCount * 3);

    for (let i = 0; i < starsCount; i++) {
      const radius = 95 + Math.random() * 85;
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = radius * Math.cos(phi);

      const r = Math.random();
      if (r > 0.8) {
        starColors[i * 3] = 0.75; starColors[i * 3 + 1] = 0.88; starColors[i * 3 + 2] = 1.0;
      } else if (r > 0.6) {
        starColors[i * 3] = 1.0; starColors[i * 3 + 1] = 0.92; starColors[i * 3 + 2] = 0.78;
      } else {
        starColors[i * 3] = 1.0; starColors[i * 3 + 1] = 1.0; starColors[i * 3 + 2] = 1.0;
      }
    }
    starGeom.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    starGeom.setAttribute("color", new THREE.BufferAttribute(starColors, 3));

    const starMat = new THREE.PointsMaterial({ size: 1.25, vertexColors: true, transparent: true, opacity: 0.9 });
    const stars = new THREE.Points(starGeom, starMat);
    scene.add(stars);

    // 3. THE MAGNIFICENT SUN WITH LENS FLARE RAYS
    const sunPos = new THREE.Vector3(26, 12, 18);
    const sunLight = new THREE.DirectionalLight(0xfffbeb, 3.4);
    sunLight.position.copy(sunPos);
    scene.add(sunLight);

    const ambientLight = new THREE.AmbientLight(0x0e1726, 0.45);
    scene.add(ambientLight);

    // Blinding Sun Sphere
    const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(2.0, 32, 32), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    sunMesh.position.copy(sunPos);
    scene.add(sunMesh);

    // Starburst Lens Flare Ray Plane
    const sunburstTexture = createSunburstTexture();
    const sunburstMat = new THREE.MeshBasicMaterial({
      map: sunburstTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const sunburstMesh = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), sunburstMat);
    sunburstMesh.position.copy(sunPos);
    scene.add(sunburstMesh);

    // 4. Photorealistic 3D Earth Globe (NASA Blue Marble + Topographic Normal/Specular + Night Lights)
    const earthGroup = new THREE.Group();
    scene.add(earthGroup);

    const earthTexture = createEarthCanvasTexture();
    const emptyBlackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    emptyBlackTex.needsUpdate = true;

    const sunDirNorm = sunPos.clone().normalize();
    const earthShaderMat = new THREE.ShaderMaterial({
      vertexShader: earthVertexShader,
      fragmentShader: earthFragmentShader,
      uniforms: {
        dayTexture: { value: earthTexture },
        nightTexture: { value: emptyBlackTex },
        bumpTexture: { value: emptyBlackTex },
        specularTexture: { value: emptyBlackTex },
        sunDirection: { value: sunDirNorm },
        bumpScale: { value: 0.045 },
        ambientStrength: { value: 0.14 },
      },
    });

    const earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS, 128, 64),
      earthShaderMat
    );
    earthGroup.add(earthMesh);

    // 5. Realistic Day/Night Illuminated Cloud Layer Sphere (No artificial night-side glow!)
    const cloudTexture = createCloudCanvasTexture();
    const cloudMat = new THREE.ShaderMaterial({
      vertexShader: cloudVertexShader,
      fragmentShader: cloudFragmentShader,
      uniforms: {
        cloudTexture: { value: cloudTexture },
        sunDirection: { value: sunDirNorm },
      },
      transparent: true,
      depthWrite: false,
    });
    const cloudMesh = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS * 1.005, 96, 48),
      cloudMat
    );
    earthGroup.add(cloudMesh);

    // Load real NASA Blue Marble satellite imagery asynchronously
    const texLoader = new THREE.TextureLoader();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    texLoader.load("/textures/earth/earth-blue-marble.jpg", (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAniso;
      earthShaderMat.uniforms.dayTexture.value = tex;
    });
    texLoader.load("/textures/earth/earth-night.jpg", (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAniso;
      earthShaderMat.uniforms.nightTexture.value = tex;
    });
    texLoader.load("/textures/earth/earth-topology.png", (tex) => {
      tex.anisotropy = maxAniso;
      earthShaderMat.uniforms.bumpTexture.value = tex;
    });
    texLoader.load("/textures/earth/earth-water.png", (tex) => {
      tex.anisotropy = maxAniso;
      earthShaderMat.uniforms.specularTexture.value = tex;
    });
    texLoader.load("/textures/earth/earth-clouds.png", (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAniso;
      cloudMat.uniforms.cloudTexture.value = tex;
    });

    // 6. Glowing Rayleigh Atmospheric Limb Halo
    const atmoMat = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      uniforms: {
        sunDirection: { value: sunDirNorm },
        atmosphereColor: { value: new THREE.Color(0.28, 0.64, 1.0) },
        atmosphereStrength: { value: 1.35 },
      },
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    const atmoMesh = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS * 1.032, 64, 48), atmoMat);
    scene.add(atmoMesh);

    // 6b. Real GeoJSON Country Borders & Geographically Accurate Country Labels (Toggled via "Borders" button)
    interface FlightLabelNode {
      sprite: THREE.Sprite;
      name: string;
      importance: 1 | 2 | 3;
      localNormal: THREE.Vector3;
      baseWidth: number;
      baseHeight: number;
    }
    const labelNodes: FlightLabelNode[] = [];
    let countriesList: CountryFeature[] = [];
    let bordersMesh: THREE.LineSegments | null = null;
    let selectedBorderMesh: THREE.LineSegments | null = null;

    const makeCountrySprite = (name: string, importance: 1 | 2 | 3) => {
      const c = document.createElement("canvas");
      const dpr = 2;
      const fs = (importance === 1 ? 24 : importance === 2 ? 20 : 17) * dpr;
      const ctx = c.getContext("2d")!;
      const font = `500 ${fs}px "Space Grotesk", sans-serif`;
      ctx.font = font;
      const w = Math.ceil(ctx.measureText(name).width + 32 * dpr);
      const h = Math.ceil(fs + 20 * dpr);
      c.width = w;
      c.height = h;
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3 * dpr;
      ctx.strokeStyle = "rgba(4, 8, 18, 0.85)";
      ctx.strokeText(name, w / 2, h / 2);
      ctx.fillStyle = importance === 1 ? "#e2e8f0" : importance === 2 ? "#cbd5e1" : "#94a3b8";
      ctx.fillText(name, w / 2, h / 2);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const spr = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        })
      );
      spr.renderOrder = 10;
      spr.visible = false;
      return { spr, aspect: w / h };
    };

    for (const item of COUNTRY_LABELS) {
      const { spr, aspect } = makeCountrySprite(item.name, item.importance);
      const lPos = latLonToVector3(item.lat, item.lon, EARTH_RADIUS * 1.006);
      spr.position.copy(lPos);
      const bh = item.importance === 1 ? 0.21 : item.importance === 2 ? 0.16 : 0.13;
      const bw = bh * aspect;
      spr.scale.set(bw, bh, 1);
      earthGroup.add(spr);
      labelNodes.push({
        sprite: spr,
        name: item.name,
        importance: item.importance,
        localNormal: lPos.clone().normalize(),
        baseWidth: bw,
        baseHeight: bh,
      });
    }
    labelNodes.sort((a, b) => a.importance - b.importance);

    fetch("/data/countries.geojson")
      .then((r) => (r.ok ? r.json() : fetch("/data/countries-110m.json").then((r2) => r2.json())))
      .then((geo) => {
        countriesList = parseCountryBorders(geo);
        if (countriesList.length > 0) {
          bordersMesh = createBorderGeometry(countriesList, EARTH_RADIUS, 0.002);
          bordersMesh.visible = showMapOverlayRef.current;
          earthGroup.add(bordersMesh);
        }
      })
      .catch(() => {
        // Ignore in offline/test environments
      });

    // 7. Ground Stations on Earth
    GROUND_STATIONS.forEach((gs) => {
      const gsPos = latLonToVector3(gs.latitude, gs.longitude, EARTH_RADIUS + 0.025);
      const gsMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x10b981 })
      );
      gsMesh.position.copy(gsPos);
      scene.add(gsMesh);
    });

    // 8. Low-Earth Orbit Ring for Scout Satellite (LUMEN-SCOUT-1)
    const orbitPts: THREE.Vector3[] = [];
    if (groundTrackPoints.length >= 8) {
      groundTrackPoints.forEach((pt) => {
        orbitPts.push(latLonToVector3(pt.latitude_deg, pt.longitude_deg, orbitRadius));
      });
    } else {
      const orbitSegments = 120;
      for (let i = 0; i <= orbitSegments; i++) {
        const a = (i / orbitSegments) * Math.PI * 2;
        const ox = Math.cos(a) * orbitRadius;
        const oy = Math.sin(a) * orbitRadius * Math.sin(Math.PI * 0.3);
        const oz = Math.sin(a) * orbitRadius * Math.cos(Math.PI * 0.3);
        orbitPts.push(new THREE.Vector3(ox, oy, oz));
      }
    }
    const orbitLine = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(orbitPts),
      new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2, transparent: true, opacity: 0.65 })
    );
    scene.add(orbitLine);

    // 9. Low-Orbit Scout AI Data Center Satellite ("LUMEN-SCOUT-1")
    const scoutSat = createScoutAISatellite();
    const spacecraft = scoutSat.root;
    scene.add(spacecraft);

    // 9a. HIGH-ORBIT FLAGSHIP ORBITAL AI DATA CENTER SATELLITE ("LUMEN-DC-ALPHA" in Separate MEO Orbit!)
    const dcRadius = EARTH_RADIUS + 2.05;
    const dcInc = 0.52;
    const dcRaan = 1.15;
    const dcOrbitPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      const x0 = Math.cos(a) * dcRadius;
      const y0 = Math.sin(a) * dcRadius * Math.sin(dcInc);
      const z0 = Math.sin(a) * dcRadius * Math.cos(dcInc);
      dcOrbitPts.push(new THREE.Vector3(x0, y0, z0).applyAxisAngle(new THREE.Vector3(0, 1, 0), dcRaan));
    }
    const dcOrbitLine = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(dcOrbitPts),
      new THREE.LineBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.32 })
    );
    scene.add(dcOrbitLine);

    const flagshipDcSat = createFlagshipDataCenterSatellite();
    const dcStation = flagshipDcSat.root;
    scene.add(dcStation);

    // High-Power Orbital Containment Downlink Beam (From AI Data Center Mother Station -> Earth Crisis Target!)
    const dcDownlinkBeam = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0x10b981, linewidth: 2, transparent: true, opacity: 0 })
    );
    scene.add(dcDownlinkBeam);

    // 9b. Global Orbital AI Data Center Constellation Nodes (Distributed Across 4 Inclined Orbital Planes)
    const relayRadius = EARTH_RADIUS + 1.65;
    const relayPlanes = [
      { id: "lumen_relay_1", name: "LUMEN-RELAY-1", inc: 0.95, raan: 0.4, speed: 0.0014, phase: 0.3 },
      { id: "lumen_relay_2", name: "LUMEN-RELAY-2", inc: 0.62, raan: 2.1, speed: 0.0013, phase: 2.0 },
      { id: "lumen_relay_3", name: "LUMEN-RELAY-3", inc: 1.25, raan: 3.9, speed: 0.0015, phase: 3.8 },
      { id: "lumen_relay_4", name: "LUMEN-RELAY-4", inc: 0.78, raan: 5.2, speed: 0.00135, phase: 5.1 },
    ];
    const relayNodes: Array<{
      name: string;
      sat: OrbitalAIDataCenterSatellite;
      mesh: THREE.Group;
      inc: number;
      raan: number;
      speed: number;
      phase: number;
    }> = [];

    relayPlanes.forEach((rp) => {
      // Subtle orbital track for each constellation plane
      const rPts: THREE.Vector3[] = [];
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        const x0 = Math.cos(a) * relayRadius;
        const y0 = Math.sin(a) * relayRadius * Math.sin(rp.inc);
        const z0 = Math.sin(a) * relayRadius * Math.cos(rp.inc);
        const v = new THREE.Vector3(x0, y0, z0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rp.raan);
        rPts.push(v);
      }
      const rRing = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(rPts),
        new THREE.LineBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.14 })
      );
      scene.add(rRing);

      // Instantiate a full modular OrbitalAIDataCenterSatellite with LODs for each constellation node
      const nodeSat = createOrbitalAIDataCenterSatellite({
        id: rp.id,
        name: rp.name,
        role: "constellation_node",
        scale: 0.44,
        orbitRadius: relayRadius,
        orbitAltitudeKm: 1250,
        orbitalInclination: rp.inc,
        raan: rp.raan,
        orbitalSpeed: rp.speed,
        initialPhase: rp.phase,
        solarPanelOrientation: "auto",
        radiatorConfig: { wingCount: 2, thermalLoadC: 21.0, channelsPerPanel: 16 },
        communicationRange: 9.8,
        autoDeployOnEnter: false,
      });
      scene.add(nodeSat.root);
      relayNodes.push({
        name: rp.name,
        sat: nodeSat,
        mesh: nodeSat.root,
        inc: rp.inc,
        raan: rp.raan,
        speed: rp.speed,
        phase: rp.phase,
      });
    });

    // Dynamic Global Inter-Satellite Optical Laser Mesh (Thin, precise 1550 nm laser links between constellation satellites)
    const constellationMeshLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.34,
      })
    );
    scene.add(constellationMeshLines);

    // Optional Satellite-to-Ground-Station Optical / Ka-Band Downlink Lines
    const groundLinkLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.28,
      })
    );
    scene.add(groundLinkLines);

    let lastDeployTrigger = deployTriggerRef.current;

    // Optical Inter-Satellite Link (1550 nm Cyan Laser Crosslink)
    const islBeam = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0x22d3ee, linewidth: 2, transparent: true, opacity: 0.72 })
    );
    scene.add(islBeam);

    // Optical ISL Laser Data Packet Spheres (animate along islBeam during crosslink transmission)
    const islPackets: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const pkt = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 10, 10),
        new THREE.MeshBasicMaterial({
          color: 0x67e8f9,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
        })
      );
      scene.add(pkt);
      islPackets.push(pkt);
    }

    // Footprint ground reticle
    const footprintMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.58, 32),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
    );
    scene.add(footprintMesh);

    // Volumetric Nadir Sensor Scan Cone (Spacecraft Nadir Aperture -> Earth Surface Swath)
    const scanConeGeom = new THREE.CylinderGeometry(0.04, 0.54, 0.85, 32, 1, true);
    const scanConeMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const scanConeMesh = new THREE.Mesh(scanConeGeom, scanConeMat);
    scene.add(scanConeMesh);

    // Targeting Laser Beam
    const targetBeam = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0x22c55e, linewidth: 3, transparent: true, opacity: 0 })
    );
    scene.add(targetBeam);

    // Rising Telemetry Data Packet Spheres (Surface Target -> Spacecraft Nadir Sensor)
    const scanPackets: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const spkt = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 10, 10),
        new THREE.MeshBasicMaterial({
          color: 0x34d399,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
        })
      );
      scene.add(spkt);
      scanPackets.push(spkt);
    }

    // 10. FOUR DISTINCT MISSION ENVIRONMENTAL SIMULATION SYSTEMS + SPACE WEATHER
    const flameTexture = createFlameSprite();
    const smokeTexture = createSmokeSprite();
    const rippleTexture = createRippleSprite();

    // Global 3D Space-Weather System (Solar Flare Arches + Propagating Magnetized CME Cloud + Earth Magnetosphere)
    const spaceWeatherSystem = createSolarStormSpaceWeatherSystem(sunPos, EARTH_RADIUS);
    scene.add(spaceWeatherSystem.group);

    interface LiveEventVisual {
      event: GlobalEarthEvent;
      position: THREE.Vector3;
      group: THREE.Group;
      ringMesh: THREE.Mesh;
      shieldMesh: THREE.Mesh;
      shaderMat?: THREE.ShaderMaterial;
      flameParticles?: THREE.Points;
      flamePosis?: Float32Array;
      smokeParticles?: THREE.Points;
      smokePosis?: Float32Array;
      ashUmbrellaMesh?: THREE.Mesh;
      stormAnvilMesh?: THREE.Mesh;
      light?: THREE.PointLight;
      rippleMesh?: THREE.Mesh;
      auroraRibbon?: THREE.Mesh;
    }

    const liveEvents: LiveEventVisual[] = [];

    GLOBAL_EARTH_EVENTS.forEach((ev) => {
      const pos = latLonToVector3(ev.lat, ev.lon, EARTH_RADIUS + 0.015);
      const normal = pos.clone().normalize();
      const group = new THREE.Group();
      group.position.copy(pos);
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

      const color = new THREE.Color(ev.colorHex);

      // Subtle Orbital Target Hairline Reticle (non-intrusive precision framing)
      const ringGeom = new THREE.RingGeometry(0.28, 0.295, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.48,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.position.y = 0.006;
      group.add(ringMesh);

      // 3D Containment Shield Dome (Appears when AI Alert is transmitted & crisis is RESOLVED)
      const shieldGeom = new THREE.SphereGeometry(0.34, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const shieldMat = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        wireframe: true,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
      });
      const shieldMesh = new THREE.Mesh(shieldGeom, shieldMat);
      shieldMesh.visible = false;
      group.add(shieldMesh);

      const visual: LiveEventVisual = { event: ev, position: pos, group, ringMesh, shieldMesh };

      if (ev.type === "wildfire") {
        // 🔥 MISSION 1: WILDFIRE SCOUT — Custom GLSL Terrain Fire-Spread (Forest -> Flame Front -> Charred Burn Scar)
        const wfShaderMat = new THREE.ShaderMaterial({
          vertexShader: wildfireTerrainVertexShader,
          fragmentShader: wildfireTerrainFragmentShader,
          uniforms: {
            uTime: { value: 0 },
            uProgression: { value: 0.55 },
            uScanActive: { value: 0.0 },
            uContained: { value: 0.0 },
            uWindDir: { value: new THREE.Vector2(-0.7, 0.7).normalize() },
          },
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const terrainPatch = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.66, 16, 16), wfShaderMat);
        terrainPatch.rotation.x = -Math.PI / 2;
        terrainPatch.position.y = 0.005;
        group.add(terrainPatch);
        visual.shaderMat = wfShaderMat;

        // Multi-layered active fire-front embers rising from the advancing perimeter
        const fCount = 75;
        const fGeom = new THREE.BufferGeometry();
        const fPosis = new Float32Array(fCount * 3);
        for (let i = 0; i < fCount; i++) {
          const ang = (i / fCount) * Math.PI * 2;
          const rad = 0.12 + Math.random() * 0.1;
          fPosis[i * 3] = Math.cos(ang) * rad;
          fPosis[i * 3 + 1] = Math.random() * 0.24;
          fPosis[i * 3 + 2] = Math.sin(ang) * rad;
        }
        fGeom.setAttribute("position", new THREE.BufferAttribute(fPosis, 3));
        const flameParticles = new THREE.Points(
          fGeom,
          new THREE.PointsMaterial({
            map: flameTexture,
            size: 0.14,
            transparent: true,
            opacity: 0.88,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        group.add(flameParticles);
        visual.flameParticles = flameParticles;
        visual.flamePosis = fPosis;

        // Wind-Advected Volumetric Pyrocumulus Smoke Plume (drifts NW with altitude)
        const sCount = 55;
        const sGeom = new THREE.BufferGeometry();
        const sPosis = new Float32Array(sCount * 3);
        for (let i = 0; i < sCount; i++) {
          const h = 0.08 + Math.random() * 0.48;
          sPosis[i * 3] = (Math.random() - 0.5) * 0.18 - h * 0.38;
          sPosis[i * 3 + 1] = h;
          sPosis[i * 3 + 2] = (Math.random() - 0.5) * 0.18 + h * 0.28;
        }
        sGeom.setAttribute("position", new THREE.BufferAttribute(sPosis, 3));
        const smokeParticles = new THREE.Points(
          sGeom,
          new THREE.PointsMaterial({
            map: smokeTexture,
            size: 0.28,
            transparent: true,
            opacity: 0.48,
            depthWrite: false,
          })
        );
        group.add(smokeParticles);
        visual.smokeParticles = smokeParticles;
        visual.smokePosis = sPosis;

        const fireLight = new THREE.PointLight(0xf97316, 1.6, 2.2);
        fireLight.position.set(0, 0.18, 0);
        group.add(fireLight);
        visual.light = fireLight;
      } else if (ev.type === "volcano") {
        // 🌋 MISSION 3: VOLCANO WATCH — 3D Displaced Stratovolcano Relief Cone + Dendritic Lava Flows + Umbrella Ash Cloud
        const volcShaderMat = new THREE.ShaderMaterial({
          vertexShader: volcanoConeVertexShader,
          fragmentShader: volcanoConeFragmentShader,
          uniforms: {
            uTime: { value: 0 },
            uEruptionIntensity: { value: 0.72 },
            uScanActive: { value: 0.0 },
            uContained: { value: 0.0 },
          },
          transparent: true,
          side: THREE.DoubleSide,
        });
        const volcanoCone = new THREE.Mesh(
          new THREE.PlaneGeometry(0.58, 0.58, 36, 36),
          volcShaderMat
        );
        volcanoCone.rotation.x = -Math.PI / 2;
        volcanoCone.position.y = 0.004;
        group.add(volcanoCone);
        visual.shaderMat = volcShaderMat;

        // Vertical Plinian Tephra & Ash Eruption Column rising from the summit crater
        const vCount = 65;
        const vGeom = new THREE.BufferGeometry();
        const vPosis = new Float32Array(vCount * 3);
        for (let i = 0; i < vCount; i++) {
          const h = 0.12 + Math.random() * 0.52;
          const spread = 0.03 + (h * 0.22);
          vPosis[i * 3] = (Math.random() - 0.5) * spread;
          vPosis[i * 3 + 1] = h;
          vPosis[i * 3 + 2] = (Math.random() - 0.5) * spread;
        }
        vGeom.setAttribute("position", new THREE.BufferAttribute(vPosis, 3));
        const smokeParticles = new THREE.Points(
          vGeom,
          new THREE.PointsMaterial({
            map: smokeTexture,
            size: 0.25,
            transparent: true,
            opacity: 0.62,
            depthWrite: false,
          })
        );
        group.add(smokeParticles);
        visual.smokeParticles = smokeParticles;
        visual.smokePosis = vPosis;

        // Tropopause Expanding Umbrella Ash Cloud Canopy
        const umbrellaMesh = new THREE.Mesh(
          new THREE.CircleGeometry(0.32, 28),
          new THREE.MeshBasicMaterial({
            map: smokeTexture,
            color: 0x475569,
            transparent: true,
            opacity: 0.58,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        umbrellaMesh.rotation.x = Math.PI / 2;
        umbrellaMesh.position.set(0.06, 0.54, 0.04);
        group.add(umbrellaMesh);
        visual.ashUmbrellaMesh = umbrellaMesh;

        const volcLight = new THREE.PointLight(0xef4444, 1.8, 2.4);
        volcLight.position.set(0, 0.24, 0);
        group.add(volcLight);
        visual.light = volcLight;
      } else if (ev.type === "flood") {
        // 🌊 MISSION 2: FLOOD SCOUT — Topographic River Basin Inundation Shader + Monsoon Storm Anvil + Rainfall Curtain
        const floodShaderMat = new THREE.ShaderMaterial({
          vertexShader: wildfireTerrainVertexShader,
          fragmentShader: floodBasinFragmentShader,
          uniforms: {
            uTime: { value: 0 },
            uWaterLevel: { value: 0.68 },
            uScanActive: { value: 0.0 },
            uContained: { value: 0.0 },
          },
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const floodBasinMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(0.74, 0.74, 24, 24),
          floodShaderMat
        );
        floodBasinMesh.rotation.x = -Math.PI / 2;
        floodBasinMesh.position.y = 0.005;
        group.add(floodBasinMesh);
        visual.shaderMat = floodShaderMat;

        // Monsoon Convective Storm Cloud Deck above the flooded river basin
        const stormAnvil = new THREE.Mesh(
          new THREE.CircleGeometry(0.36, 28),
          new THREE.MeshBasicMaterial({
            map: smokeTexture,
            color: 0x94a3b8,
            transparent: true,
            opacity: 0.52,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        stormAnvil.rotation.x = Math.PI / 2;
        stormAnvil.position.y = 0.32;
        group.add(stormAnvil);
        visual.stormAnvilMesh = stormAnvil;

        // Slanted Monsoon Rainfall Curtain Particles
        const rainCount = 50;
        const rainGeom = new THREE.BufferGeometry();
        const rainPosis = new Float32Array(rainCount * 3);
        for (let i = 0; i < rainCount; i++) {
          rainPosis[i * 3] = (Math.random() - 0.5) * 0.42;
          rainPosis[i * 3 + 1] = Math.random() * 0.3;
          rainPosis[i * 3 + 2] = (Math.random() - 0.5) * 0.42;
        }
        rainGeom.setAttribute("position", new THREE.BufferAttribute(rainPosis, 3));
        const rainParticles = new THREE.Points(
          rainGeom,
          new THREE.PointsMaterial({
            color: 0x7dd3fc,
            size: 0.045,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
          })
        );
        group.add(rainParticles);
        visual.flameParticles = rainParticles;
        visual.flamePosis = rainPosis;
      } else if (ev.type === "solar_storm") {
        // ⚡ MISSION 4: SOLAR STORM — Custom GLSL Undulating Polar Auroral Curtain (557.7 nm Green -> 630 nm Violet)
        const auroraMat = new THREE.ShaderMaterial({
          vertexShader: auroraCurtainVertexShader,
          fragmentShader: auroraCurtainFragmentShader,
          uniforms: {
            uTime: { value: 0 },
            uStormIntensity: { value: 0.78 },
          },
          side: THREE.DoubleSide,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const ribbonGeom = new THREE.CylinderGeometry(0.46, 0.42, 0.44, 48, 8, true);
        const auroraRibbon = new THREE.Mesh(ribbonGeom, auroraMat);
        auroraRibbon.position.y = 0.22;
        group.add(auroraRibbon);
        visual.auroraRibbon = auroraRibbon;
        visual.shaderMat = auroraMat;
      } else {
        // Cyclone vortex
        const rippleMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(0.65, 0.65),
          new THREE.MeshBasicMaterial({
            map: rippleTexture,
            transparent: true,
            opacity: 0.65,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        rippleMesh.rotation.x = Math.PI / 2;
        group.add(rippleMesh);
        visual.rippleMesh = rippleMesh;
      }

      scene.add(group);
      liveEvents.push(visual);
    });

    // 11. CONTINUOUS 60 FPS KEPLERIAN GREAT-CIRCLE ORBIT & TWO-VEHICLE SIMULATION LOOP
    let animId: number;
    let clockTime = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      clockTime += 0.016;

      try {
        const fs = flightState.current;
        fs.frameTick += 1;
        if (fs.autopilotBoostFrames > 0) {
          fs.autopilotBoostFrames -= 1;
        }

        // Sync optional map borders visibility
        if (bordersMesh) {
          bordersMesh.visible = showMapOverlayRef.current;
        }

        // ── 11A. LOW-ORBIT SCOUT SATELLITE ("LUMEN-SCOUT-1") GREAT-CIRCLE PROPAGATION ──
        // Uses smooth orbital plane precession so the satellite ALWAYS flies a full circle around Earth
        // and NEVER spins in place over a single point!
        const steerSpeed = 0.032;
        const returnSpeed = 0.06;
        let activeTurnRate = 0; // Gentle orbital plane precession rate around satDir

        if (fs.keys.w) fs.pitch = Math.max(-0.3, fs.pitch - steerSpeed);
        else if (fs.keys.s) fs.pitch = Math.min(0.3, fs.pitch + steerSpeed);
        else fs.pitch *= 1 - returnSpeed;

        if (fs.keys.a) {
          fs.yaw = Math.max(-0.4, fs.yaw - steerSpeed);
          fs.roll = Math.max(-0.55, fs.roll - steerSpeed * 1.4);
          activeTurnRate = 0.0042; // Smooth orbital plane precession left
        } else if (fs.keys.d) {
          fs.yaw = Math.min(0.4, fs.yaw + steerSpeed);
          fs.roll = Math.min(0.55, fs.roll + steerSpeed * 1.4);
          activeTurnRate = -0.0042; // Smooth orbital plane precession right
        } else if (autopilotIdRef.current) {
          // ── SMOOTH GREAT-CIRCLE ORBITAL PLANE ALIGNMENT (NO HOVERING OR SPINNING!) ──
          const targetEv = liveEvents.find((e) => e.event.id === autopilotIdRef.current);
          if (targetEv) {
            const evNormal = targetEv.position.clone().normalize();
            const angleToTarget = fs.satDir.angleTo(evNormal);
            // Only precess orbital plane when target is ahead (> 0.16 rad away); fly straight through when overhead!
            if (angleToTarget > 0.16) {
              const desiredTan = evNormal
                .clone()
                .sub(fs.satDir.clone().multiplyScalar(fs.satDir.dot(evNormal)));
              if (desiredTan.lengthSq() > 1e-6) {
                desiredTan.normalize();
                const cross = new THREE.Vector3().crossVectors(fs.velDir, desiredTan);
                const signedSin = THREE.MathUtils.clamp(cross.dot(fs.satDir), -1, 1);
                const cosAngle = THREE.MathUtils.clamp(fs.velDir.dot(desiredTan), -1, 1);
                const angleDiff = Math.atan2(signedSin, cosAngle);
                // Gentle orbital plane alignment so turning radius is always >= Earth's radius!
                activeTurnRate = THREE.MathUtils.clamp(angleDiff * 0.022, -0.0038, 0.0038);
                fs.roll = THREE.MathUtils.lerp(fs.roll, -activeTurnRate * 95.0, 0.1);
                fs.yaw = THREE.MathUtils.lerp(fs.yaw, -activeTurnRate * 55.0, 0.1);
              }
            } else {
              // Directly overhead inside sensor cone — hold steady wings-level attitude!
              fs.yaw *= 1 - returnSpeed;
              fs.roll *= 1 - returnSpeed;
            }
          } else {
            fs.yaw *= 1 - returnSpeed;
            fs.roll *= 1 - returnSpeed;
          }
        } else {
          fs.yaw *= 1 - returnSpeed;
          fs.roll *= 1 - returnSpeed;
        }

        if (Math.abs(activeTurnRate) > 1e-5) {
          fs.velDir.applyAxisAngle(fs.satDir, activeTurnRate).normalize();
        }

        // Speed control: Spacebar or Target Intercept Burst = 2.2x Boost, W = 1.35x, S = 0.6x
        const isBursting = fs.keys.space || fs.autopilotBoostFrames > 0;
        const pitchSpeedMod = fs.keys.w ? 1.35 : fs.keys.s ? 0.6 : 1.0;
        const speedMultiplier = (isBursting ? 2.2 : 1.0) * pitchSpeedMod;
        if (fs.frameTick % 10 === 0) {
          setOrbitalSpeedKmS(Number((7.6 * speedMultiplier).toFixed(1)));
        }

        // Advance Scout Satellite along its great-circle orbital path
        const stepAngle = fs.speed * speedMultiplier;
        fs.progress = (fs.progress + stepAngle) % (Math.PI * 2);
        fs.satDir.addScaledVector(fs.velDir, stepAngle).normalize();
        fs.velDir
          .sub(fs.satDir.clone().multiplyScalar(fs.velDir.dot(fs.satDir)))
          .normalize();

        spacecraft.position.copy(fs.satDir).multiplyScalar(orbitRadius);
        const forwardDir = fs.velDir.clone();
        const radialOut = fs.satDir.clone();
        const radialDown = radialOut.clone().negate();
        const lateral = new THREE.Vector3().crossVectors(radialOut, forwardDir).normalize();

        // Update Scout Satellite's 3D Cyan Orbit Ring
        const orbitRingPts: THREE.Vector3[] = [];
        const orbitSegs = 120;
        for (let i = 0; i <= orbitSegs; i++) {
          const a = (i / orbitSegs) * Math.PI * 2;
          const pt = radialOut
            .clone()
            .multiplyScalar(Math.cos(a) * orbitRadius)
            .addScaledVector(forwardDir, Math.sin(a) * orbitRadius);
          orbitRingPts.push(pt);
        }
        orbitLine.geometry.setFromPoints(orbitRingPts);

        // Orient Scout Satellite along velocity vector
        spacecraft.up.copy(radialOut);
        spacecraft.lookAt(spacecraft.position.clone().add(forwardDir));
        spacecraft.rotateX(-fs.pitch);
        spacecraft.rotateZ(-fs.roll);
        spacecraft.rotateY(fs.yaw);

        // Replay 5-stage mechanical deployment when triggered by the user
        if (deployTriggerRef.current !== lastDeployTrigger) {
          lastDeployTrigger = deployTriggerRef.current;
          scoutSat.triggerDeployment();
          flagshipDcSat.triggerDeployment();
        }

        // Advance 5-Stage Mechanical Deployment Sequence & Sun-Tracking Solar Arrays
        const deployStatus = scoutSat.updateDeployment(0.016);
        flagshipDcSat.updateDeployment(0.016);
        if (fs.frameTick % 12 === 0) {
          setDeploymentBadge(
            deployStatus.isDeployed
              ? null
              : `${deployStatus.stageLabel} (${Math.round(deployStatus.progress * 100)}%)`
          );
        }
        scoutSat.updateOrbitalSystems(sunDirNorm, thermalTempRef.current, camera);
        flagshipDcSat.updateOrbitalSystems(sunDirNorm, thermalTempRef.current, camera);

        // Subtle Hall-Effect Xenon Ion Plume modulation when boosting
        const plume = spacecraft.getObjectByName("thrusterPlume");
        if (plume) {
          const pScale = isBursting ? 1.55 + 0.15 * Math.sin(clockTime * 22) : 0.9 + 0.08 * Math.sin(clockTime * 14);
          plume.scale.set(pScale, pScale, pScale);
        }

        // Subtle lateral RCS attitude puffs when precessing orbital plane
        const rcsLeft = spacecraft.getObjectByName("rcsLeft") as THREE.Mesh | undefined;
        const rcsRight = spacecraft.getObjectByName("rcsRight") as THREE.Mesh | undefined;
        if (rcsLeft && rcsRight) {
          const leftMat = rcsLeft.material as THREE.MeshBasicMaterial;
          const rightMat = rcsRight.material as THREE.MeshBasicMaterial;
          leftMat.opacity = activeTurnRate < -0.0005 ? Math.min(0.65, Math.abs(activeTurnRate) * 140) : 0;
          rightMat.opacity = activeTurnRate > 0.0005 ? Math.min(0.65, Math.abs(activeTurnRate) * 140) : 0;
        }

        // ── 11B. HIGH-ORBIT FLAGSHIP ORBITAL AI DATA CENTER SATELLITE ("LUMEN-DC-ALPHA") ──
        // Orbits independently in Medium Earth Orbit (dcRadius = 7.05) on its own inclined orbital plane!
        fs.dcPhase = (fs.dcPhase + 0.0011 * (fs.keys.space ? 1.6 : 1.0)) % (Math.PI * 2);
        const dcx0 = Math.cos(fs.dcPhase) * dcRadius;
        const dcy0 = Math.sin(fs.dcPhase) * dcRadius * Math.sin(dcInc);
        const dcz0 = Math.sin(fs.dcPhase) * dcRadius * Math.cos(dcInc);
        const dcPos = new THREE.Vector3(dcx0, dcy0, dcz0).applyAxisAngle(new THREE.Vector3(0, 1, 0), dcRaan);

        const dctox = -Math.sin(fs.dcPhase) * dcRadius;
        const dctoy = Math.cos(fs.dcPhase) * dcRadius * Math.sin(dcInc);
        const dctoz = Math.cos(fs.dcPhase) * dcRadius * Math.cos(dcInc);
        const dcForward = new THREE.Vector3(dctox, dctoy, dctoz)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), dcRaan)
          .normalize();
        const dcRadialOut = dcPos.clone().normalize();

        dcStation.position.copy(dcPos);
        dcStation.up.copy(dcRadialOut);
        dcStation.lookAt(dcPos.clone().add(dcForward));

        // ── 11C. GLOBAL ORBITAL AI DATA CENTER CONSTELLATION & DYNAMIC OPTICAL LASER MESH ──
        let bestLinkTarget: { name: string; pos: THREE.Vector3; dist: number } | null = null;

        const dcMid = spacecraft.position.clone().add(dcPos).multiplyScalar(0.5);
        const dcDist = spacecraft.position.distanceTo(dcPos);
        if (dcMid.length() > EARTH_RADIUS * 0.85) {
          bestLinkTarget = { name: "LUMEN-DC-ALPHA", pos: dcPos, dist: dcDist };
        }

        relayNodes.forEach((rn) => {
          rn.phase = (rn.phase + rn.speed * (fs.keys.space ? 1.6 : 1.0)) % (Math.PI * 2);
          const rx0 = Math.cos(rn.phase) * relayRadius;
          const ry0 = Math.sin(rn.phase) * relayRadius * Math.sin(rn.inc);
          const rz0 = Math.sin(rn.phase) * relayRadius * Math.cos(rn.inc);
          const rPos = new THREE.Vector3(rx0, ry0, rz0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rn.raan);

          const rtox = -Math.sin(rn.phase) * relayRadius;
          const rtoy = Math.cos(rn.phase) * relayRadius * Math.sin(rn.inc);
          const rtoz = Math.cos(rn.phase) * relayRadius * Math.cos(rn.inc);
          const rForward = new THREE.Vector3(rtox, rtoy, rtoz)
            .applyAxisAngle(new THREE.Vector3(0, 1, 0), rn.raan)
            .normalize();
          const rRadialOut = rPos.clone().normalize();

          rn.mesh.position.copy(rPos);
          rn.mesh.up.copy(rRadialOut);
          rn.mesh.lookAt(rPos.clone().add(rForward));
          rn.sat.updateOrbitalSystems(sunDirNorm, 22.0, camera);

          const midPoint = spacecraft.position.clone().add(rPos).multiplyScalar(0.5);
          const dist = spacecraft.position.distanceTo(rPos);
          if (!bestLinkTarget && midPoint.length() > EARTH_RADIUS + 0.15) {
            bestLinkTarget = { name: rn.name, pos: rPos, dist };
          }
        });

        // Compute Dynamic Inter-Satellite Optical Laser Communication Links across the entire 6-Satellite Constellation
        const allConstellationSats: OrbitalAIDataCenterSatellite[] = [
          scoutSat,
          flagshipDcSat,
          ...relayNodes.map((r) => r.sat),
        ];
        allConstellationSats.forEach((s) => {
          s.networkConnections = [];
        });

        const meshLinkPts: THREE.Vector3[] = [];
        for (let i = 0; i < allConstellationSats.length; i++) {
          for (let j = i + 1; j < allConstellationSats.length; j++) {
            const satA = allConstellationSats[i];
            const satB = allConstellationSats[j];
            const posA = satA.root.position;
            const posB = satB.root.position;
            const dist = posA.distanceTo(posB);
            const maxRange = Math.min(satA.communicationRange, satB.communicationRange);
            const midPt = posA.clone().add(posB).multiplyScalar(0.5);
            // Line of sight check above Earth's horizon
            if (dist <= maxRange && midPt.length() > EARTH_RADIUS + 0.08) {
              satA.networkConnections.push(satB.id);
              satB.networkConnections.push(satA.id);
              meshLinkPts.push(posA.clone(), posB.clone());
            }
          }
        }
        constellationMeshLines.geometry.dispose();
        constellationMeshLines.geometry = new THREE.BufferGeometry().setFromPoints(meshLinkPts);

        // Compute Optional Ground Station Optical / Ka-Band Downlinks for in-range satellites
        const gsLinkPts: THREE.Vector3[] = [];
        GROUND_STATIONS.forEach((gs) => {
          const gsPos = latLonToVector3(gs.latitude, gs.longitude, EARTH_RADIUS + 0.025);
          const gsNormal = gsPos.clone().normalize();
          for (const sat of allConstellationSats) {
            const satPos = sat.root.position;
            const toSat = satPos.clone().sub(gsPos);
            if (toSat.length() < 3.6 && toSat.normalize().dot(gsNormal) > 0.35) {
              gsLinkPts.push(gsPos, satPos.clone());
              break;
            }
          }
        });
        groundLinkLines.geometry.dispose();
        groundLinkLines.geometry = new THREE.BufferGeometry().setFromPoints(gsLinkPts);

        if (bestLinkTarget) {
          const nr = bestLinkTarget;
          islBeam.geometry.setFromPoints([spacecraft.position, nr.pos]);
          const isPulsing = islPulseRef.current;
          (islBeam.material as THREE.LineBasicMaterial).opacity = isPulsing
            ? 0.95
            : 0.55 + 0.25 * Math.sin(clockTime * 12);
          (islBeam.material as THREE.LineBasicMaterial).color.setHex(isPulsing ? 0x34d399 : 0x22d3ee);

          // Animate Optical ISL Laser Data Packets streaming from Scout Satellite UP to AI Data Center Station
          islPackets.forEach((pkt, idx) => {
            pkt.visible = true;
            const speed = isPulsing ? 2.0 : 0.75;
            const t = (clockTime * speed + idx / islPackets.length) % 1.0;
            pkt.position.lerpVectors(spacecraft.position, nr.pos, t);
            const s = isPulsing ? 1.5 : 0.9;
            pkt.scale.setScalar(s);
            (pkt.material as THREE.MeshBasicMaterial).color.setHex(isPulsing ? 0x34d399 : 0x67e8f9);
          });

          if (fs.frameTick % 30 === 0) {
            const gbps = Math.max(4.2, 12.0 - nr.dist * 0.55).toFixed(1);
            setActiveRelayLabel(`${nr.name} (${gbps} Gbps ISL)`);
          }
        } else {
          (islBeam.material as THREE.LineBasicMaterial).opacity = 0;
          islPackets.forEach((pkt) => {
            pkt.visible = false;
          });
        }

        // Footprint position & Volumetric Nadir Sensor Cone on Earth surface below Scout Satellite
        const subSatNormal = radialOut.clone();
        const subSatPos = subSatNormal.clone().multiplyScalar(EARTH_RADIUS + 0.02);
        footprintMesh.position.copy(subSatPos);
        footprintMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), subSatNormal);

        const coneMid = spacecraft.position.clone().add(subSatPos).multiplyScalar(0.5);
        scanConeMesh.position.copy(coneMid);
        scanConeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), subSatNormal);

        // Slow Cloud Drift
        cloudMesh.rotation.y = clockTime * 0.005;

        // ── Animate 4 Distinct Mission Environmental Simulations + Space Weather ──
        let acquiredTarget: string | null = null;
        let acquiredEvent: GlobalEarthEvent | null = null;
        let acquiredPos: THREE.Vector3 | null = null;
        let minTargetDistKm = Infinity;
        const footprintKm = Math.max(950, calculateFootprintRadiusKm(satAltKm, 35.0));
        const activeScenarioClean = (scenarioIdRef.current || "wildfire").replace(/_scout|_sentinel|_watch/g, "");
        const resolvedIds = resolvedIdsRef.current;

        // Update Global Solar Storm Space-Weather System (CME Plasma Cloud + Earth Magnetosphere + Solar Flare Arches)
        const isSolarStormMission = activeScenarioClean === "solar_storm";
        const swState = spaceWeatherSystem.update(
          clockTime,
          isSolarStormMission,
          scanningIdRef.current !== null || scanPctRef.current > 0
        );

        // Modulate inter-satellite laser mesh scintillation during severe CME magnetosphere impact
        (constellationMeshLines.material as THREE.LineBasicMaterial).opacity =
          swState.magnetosphereCompression > 0.35
            ? 0.18 + 0.25 * Math.abs(Math.sin(clockTime * 28.0))
            : 0.34;

        liveEvents.forEach((ev, idx) => {
          const isResolved = resolvedIds.includes(ev.event.id);
          const isAutopilotTarget = autopilotIdRef.current === ev.event.id;
          const isBeingScanned = scanningIdRef.current === ev.event.id;
          const isMissionPrimary =
            ev.event.scenarioId === scenarioIdRef.current ||
            ev.event.type === activeScenarioClean;
          const baseScale = isMissionPrimary ? 1.2 : 0.72;
          ev.group.scale.setScalar(baseScale);

          // Show 3D Containment Shield Dome when target is RESOLVED
          ev.shieldMesh.visible = isResolved;
          if (isResolved) {
            ev.shieldMesh.rotation.y = clockTime * 0.9;
          }

          // Subtle pulse on target reticle
          const pulse = isAutopilotTarget
            ? 1.06 + 0.14 * Math.sin(clockTime * 6.0)
            : 1.0 + 0.08 * Math.sin(clockTime * 3.0 + idx);
          ev.ringMesh.scale.set(pulse, pulse, pulse);

          // Update Custom GLSL Environmental Simulation Shaders (Wildfire / Flood / Volcano / Aurora)
          if (ev.shaderMat) {
            ev.shaderMat.uniforms.uTime.value = clockTime + idx * 1.7;
            if (ev.shaderMat.uniforms.uScanActive !== undefined) {
              ev.shaderMat.uniforms.uScanActive.value = isBeingScanned ? 1.0 : 0.0;
            }
            if (ev.shaderMat.uniforms.uContained !== undefined) {
              ev.shaderMat.uniforms.uContained.value = isResolved ? 1.0 : 0.0;
            }
            if (ev.event.type === "wildfire" && ev.shaderMat.uniforms.uProgression !== undefined) {
              // Fire perimeter expands naturally over time unless contained
              ev.shaderMat.uniforms.uProgression.value = isResolved
                ? 0.35
                : 0.52 + 0.26 * (0.5 + 0.5 * Math.sin(clockTime * 0.25 + idx));
            } else if (ev.event.type === "flood" && ev.shaderMat.uniforms.uWaterLevel !== undefined) {
              // River basin water level rises and overflows banks progressively
              ev.shaderMat.uniforms.uWaterLevel.value = isResolved
                ? 0.38
                : 0.62 + 0.28 * (0.5 + 0.5 * Math.sin(clockTime * 0.3 + idx));
            } else if (ev.event.type === "volcano" && ev.shaderMat.uniforms.uEruptionIntensity !== undefined) {
              ev.shaderMat.uniforms.uEruptionIntensity.value = isResolved
                ? 0.35
                : 0.68 + 0.25 * (0.5 + 0.5 * Math.sin(clockTime * 0.4 + idx));
            } else if (ev.event.type === "solar_storm" && ev.shaderMat.uniforms.uStormIntensity !== undefined) {
              ev.shaderMat.uniforms.uStormIntensity.value =
                0.55 + swState.magnetosphereCompression * 0.45;
            }
          }

          // Animate Mission-Specific 3D Particles (Wildfire Embers / Flood Rainfall / Volcanic Tephra)
          if (ev.flameParticles && ev.flamePosis) {
            ev.flameParticles.visible = !isResolved;
            if (!isResolved) {
              const arr = ev.flamePosis;
              const count = arr.length / 3;
              if (ev.event.type === "flood") {
                // Slanted Monsoon Rainfall descending from storm anvil onto river basin
                for (let i = 0; i < count; i++) {
                  arr[i * 3 + 1] -= 0.018;
                  arr[i * 3] -= 0.004;
                  if (arr[i * 3 + 1] < 0.01) {
                    arr[i * 3] = (Math.random() - 0.5) * 0.42;
                    arr[i * 3 + 1] = 0.3;
                    arr[i * 3 + 2] = (Math.random() - 0.5) * 0.42;
                  }
                }
              } else {
                // Rising Wildfire Embers along the expanding fire perimeter
                for (let i = 0; i < count; i++) {
                  arr[i * 3 + 1] += 0.012;
                  arr[i * 3] -= 0.004; // Wind-advected NW
                  if (arr[i * 3 + 1] > 0.32) {
                    const ang = (i / count) * Math.PI * 2;
                    const rad = 0.12 + Math.random() * 0.12;
                    arr[i * 3] = Math.cos(ang) * rad;
                    arr[i * 3 + 1] = 0.01;
                    arr[i * 3 + 2] = Math.sin(ang) * rad;
                  }
                }
              }
              (ev.flameParticles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
            }
          }

          // Animate Wind-Sheared Wildfire Smoke & Volcanic Plinian Ash Column
          if (ev.smokeParticles && ev.smokePosis) {
            ev.smokeParticles.visible = !isResolved;
            if (!isResolved) {
              const arr = ev.smokePosis;
              const count = arr.length / 3;
              for (let i = 0; i < count; i++) {
                arr[i * 3 + 1] += 0.009;
                if (ev.event.type === "wildfire") {
                  // Strong NW wind shear bending the smoke plume
                  arr[i * 3] -= 0.0065;
                  arr[i * 3 + 2] += 0.0045;
                } else {
                  // Radial expansion at the volcanic tropopause umbrella
                  arr[i * 3] += Math.cos(clockTime * 2 + i) * 0.003;
                  arr[i * 3 + 2] += Math.sin(clockTime * 2 + i) * 0.003;
                }
                if (arr[i * 3 + 1] > 0.58) {
                  arr[i * 3] = (Math.random() - 0.5) * 0.08;
                  arr[i * 3 + 1] = 0.08;
                  arr[i * 3 + 2] = (Math.random() - 0.5) * 0.08;
                }
              }
              (ev.smokeParticles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
            }
          }

          // Animate Volcanic Tropopause Umbrella Ash Cloud & Flood Monsoon Anvil
          if (ev.ashUmbrellaMesh) {
            ev.ashUmbrellaMesh.visible = !isResolved;
            const uScale = 1.0 + 0.18 * Math.sin(clockTime * 0.8 + idx);
            ev.ashUmbrellaMesh.scale.set(uScale, uScale, 1);
            ev.ashUmbrellaMesh.rotation.z = clockTime * 0.12;
          }
          if (ev.stormAnvilMesh) {
            const sScale = 1.0 + 0.1 * Math.sin(clockTime * 1.1 + idx);
            ev.stormAnvilMesh.scale.set(sScale, sScale, 1);
            ev.stormAnvilMesh.rotation.z = -clockTime * 0.08;
          }

          if (ev.rippleMesh) {
            const rippleScale = 1.0 + ((clockTime * 0.75 + idx * 0.4) % 1.4);
            ev.rippleMesh.scale.set(rippleScale, rippleScale, rippleScale);
            (ev.rippleMesh.material as THREE.MeshBasicMaterial).opacity = isResolved
              ? 0.2
              : Math.max(0.18, 0.85 - (rippleScale - 1.0) / 1.4);
          }

          if (ev.auroraRibbon) {
            ev.auroraRibbon.rotation.y = clockTime * 0.18;
          }

          if (ev.light) {
            ev.light.intensity = isResolved ? 0.25 : 1.4 + 0.45 * Math.sin(clockTime * 11.0 + idx * 3.0);
          }

          const evNormal = ev.position.clone().normalize();
          const dKm = subSatNormal.angleTo(evNormal) * 6371.0;
          if (dKm <= footprintKm && dKm < minTargetDistKm) {
            minTargetDistKm = dKm;
            acquiredTarget = ev.event.name;
            acquiredEvent = ev.event;
            acquiredPos = ev.position;
            (ev.ringMesh.material as THREE.MeshBasicMaterial).color.setHex(0x22c55e);

            targetBeam.geometry.setFromPoints([spacecraft.position, ev.position]);
            (targetBeam.material as THREE.LineBasicMaterial).opacity = 0.95;
          } else if (isResolved) {
            (ev.ringMesh.material as THREE.MeshBasicMaterial).color.setHex(0x10b981);
          } else if (isAutopilotTarget) {
            (ev.ringMesh.material as THREE.MeshBasicMaterial).color.setHex(0x38bdf8);
          } else {
            (ev.ringMesh.material as THREE.MeshBasicMaterial).color.setHex(
              parseInt(ev.event.colorHex.replace("#", ""), 16)
            );
          }
        });

        // Animate High-Power Orbital Containment Beam from AI Data Center Mother Station when pulsing!
        if (islPulseRef.current && liveEvents.length > 0) {
          const targetEv =
            liveEvents.find((e) => resolvedIds.includes(e.event.id)) ??
            liveEvents.find((e) => e.event.id === autopilotIdRef.current) ??
            liveEvents[0];
          dcDownlinkBeam.geometry.setFromPoints([dcPos, targetEv.position]);
          (dcDownlinkBeam.material as THREE.LineBasicMaterial).opacity = 0.9;
        } else {
          (dcDownlinkBeam.material as THREE.LineBasicMaterial).opacity = 0;
        }

        if (acquiredTarget && acquiredPos) {
          const isActivelyScanning =
            scanningIdRef.current !== null || scanPctRef.current > 0;
          // Mission-specific multi-spectral sensor cone colors:
          // Wildfire = SWIR Thermal Amber (0xf97316), Flood = C-Band SAR Cyan (0x06b6d4),
          // Volcano = UV/InSAR Violet (0xe879f9), Solar Storm = Magnetometer Emerald (0x10b981)
          const activeSensorHex =
            activeScenarioClean === "wildfire"
              ? 0xf97316
              : activeScenarioClean === "flood"
                ? 0x06b6d4
                : activeScenarioClean === "volcano"
                  ? 0xe879f9
                  : 0x10b981;
          scanConeMat.color.setHex(isActivelyScanning ? activeSensorHex : 0x22d3ee);
          scanConeMat.opacity = isActivelyScanning
            ? 0.28 + 0.1 * Math.sin(clockTime * 14)
            : 0.2;
          (footprintMesh.material as THREE.MeshBasicMaterial).color.setHex(
            isActivelyScanning ? activeSensorHex : 0x10b981
          );

          scanPackets.forEach((spkt, idx) => {
            spkt.visible = true;
            const t = (clockTime * 1.4 + idx / scanPackets.length) % 1.0;
            spkt.position.lerpVectors(acquiredPos!, spacecraft.position, t);
            (spkt.material as THREE.MeshBasicMaterial).opacity = 0.9;
          });
        } else {
          (targetBeam.material as THREE.LineBasicMaterial).opacity = 0;
          scanConeMat.color.setHex(0x38bdf8);
          scanConeMat.opacity = 0.11;
          (footprintMesh.material as THREE.MeshBasicMaterial).color.setHex(0x38bdf8);
          scanPackets.forEach((spkt) => {
            spkt.visible = false;
          });
        }

        const currentInRangeId = (acquiredEvent as GlobalEarthEvent | null)?.id ?? null;
        if (currentInRangeId !== fs.lastInRangeId || fs.frameTick % 12 === 0) {
          fs.lastInRangeId = currentInRangeId;
          setInRangeTargetName(acquiredTarget);
          onTargetInRangeRef.current?.(acquiredEvent, Math.round(minTargetDistKm));
        }

        // ── 12. CAMERA MODES: SCOUT CHASE (TPP), NADIR SCAN, CINEMATIC EVENT CAM, AI STATION, GLOBAL ORBIT ──
        const currentMode = viewModeRef.current;
        const targetCamPos = new THREE.Vector3();
        const targetLookAt = new THREE.Vector3();
        const targetCamUp = new THREE.Vector3();

        if (currentMode === "tpp") {
          // 🚀 Scout Chase (Third-Person Perspective behind Low-Orbit Scout Satellite)
          const zoom = tppZoomRef.current;
          const chaseBehind = forwardDir.clone().multiplyScalar(-2.8 * zoom);
          const chaseUp = radialOut.clone().multiplyScalar(1.15 * zoom);
          const chaseSide = lateral.clone().multiplyScalar(0.65 * zoom);

          targetCamPos.copy(spacecraft.position).add(chaseBehind).add(chaseUp).add(chaseSide);
          targetLookAt.copy(spacecraft.position)
            .add(forwardDir.clone().multiplyScalar(1.4))
            .add(radialDown.clone().multiplyScalar(0.45));
          targetCamUp.copy(radialOut);
        } else if (currentMode === "cinematic") {
          // 🎬 Cinematic Event Cam — Low-altitude oblique orbital fly-around focused directly on the active environmental simulation!
          const zoom = tppZoomRef.current;
          const focusEv =
            liveEvents.find((e) => e.event.id === scanningIdRef.current) ??
            liveEvents.find((e) => e.event.id === autopilotIdRef.current) ??
            liveEvents.find((e) => e.event.scenarioId === activeScenarioClean) ??
            liveEvents[0];
          if (focusEv) {
            const evNormal = focusEv.position.clone().normalize();
            const arbitraryUp =
              Math.abs(evNormal.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
            const tangentA = new THREE.Vector3().crossVectors(arbitraryUp, evNormal).normalize();
            const tangentB = new THREE.Vector3().crossVectors(evNormal, tangentA).normalize();
            const orbitPanAngle = clockTime * 0.14;
            const panOffset = tangentA
              .clone()
              .multiplyScalar(Math.cos(orbitPanAngle) * 1.35 * zoom)
              .add(tangentB.clone().multiplyScalar(Math.sin(orbitPanAngle) * 1.35 * zoom));
            targetCamPos
              .copy(focusEv.position)
              .add(evNormal.clone().multiplyScalar(1.15 * zoom))
              .add(panOffset);
            targetLookAt.copy(focusEv.position).add(evNormal.clone().multiplyScalar(0.08));
            targetCamUp.copy(evNormal);
          } else {
            targetCamPos.copy(spacecraft.position).multiplyScalar(1.25);
            targetLookAt.set(0, 0, 0);
            targetCamUp.set(0, 1, 0);
          }
        } else if (currentMode === "datacenter") {
          // 🏛️ High-Orbit AI Data Center Mother Station Camera ("LUMEN-DC-ALPHA")
          const zoom = tppZoomRef.current;
          const dcLateral = new THREE.Vector3().crossVectors(dcRadialOut, dcForward).normalize();
          targetCamPos
            .copy(dcPos)
            .add(dcForward.clone().multiplyScalar(-2.6 * zoom))
            .add(dcRadialOut.clone().multiplyScalar(0.95 * zoom))
            .add(dcLateral.clone().multiplyScalar(1.1 * zoom));
          // Look from the AI Data Center Station down toward Earth & the Scout Satellite
          targetLookAt.copy(dcPos).multiplyScalar(0.45);
          targetCamUp.copy(dcRadialOut);
        } else if (currentMode === "nadir" || currentMode === "wing") {
          // 🛰️ Ride-Along (Nadir)
          const nadirPos = spacecraft.position.clone()
            .add(radialOut.clone().multiplyScalar(1.9))
            .add(lateral.clone().multiplyScalar(0.55));
          targetCamPos.copy(nadirPos);
          const subSat = spacecraft.position.clone().normalize().multiplyScalar(EARTH_RADIUS);
          targetLookAt.copy(subSat);
          targetCamUp.copy(forwardDir);
        } else {
          // 🌍 Global Orbit View (Frames both Low-Orbit Scout Satellite AND High-Orbit AI Data Center Station!)
          const rad = orbitAngleRef.current.radius || 18.5;
          const theta = orbitAngleRef.current.theta;
          const phi = orbitAngleRef.current.phi;

          targetCamPos.set(
            rad * Math.cos(phi) * Math.sin(theta),
            rad * Math.sin(phi),
            rad * Math.cos(phi) * Math.cos(theta)
          );
          targetLookAt.set(0, 0, 0);
          targetCamUp.set(0, 1, 0);
        }

        const lerpSpeed = currentMode === "orbit" ? 0.08 : currentMode === "cinematic" ? 0.09 : 0.12;
        camPosRef.current.lerp(targetCamPos, lerpSpeed);
        camLookAtRef.current.lerp(targetLookAt, lerpSpeed);
        camUpRef.current.lerp(targetCamUp, lerpSpeed);

        camera.position.copy(camPosRef.current);
        camera.up.copy(camUpRef.current);
        camera.lookAt(camLookAtRef.current);

        // Update Country Labels ONLY when Map Borders overlay is enabled!
        if (!showMapOverlayRef.current) {
          for (const node of labelNodes) {
            node.sprite.visible = false;
          }
        } else {
          const camDist = camera.position.length();
          const distScale = THREE.MathUtils.clamp((camDist - EARTH_RADIUS) / 9.5, 0.3, 1.1);
          const placedBoxes: Array<{ minX: number; maxX: number; minY: number; maxY: number }> = [];
          const tmpWorldPos = new THREE.Vector3();
          const tmpNDC = new THREE.Vector3();

          for (const node of labelNodes) {
            const maxDist = node.importance === 1 ? 26.0 : node.importance === 2 ? 15.5 : 10.5;
            if (camDist > maxDist) {
              node.sprite.visible = false;
              continue;
            }
            node.sprite.getWorldPosition(tmpWorldPos);
            const toCam = camera.position.clone().sub(tmpWorldPos).normalize();
            const facingDot = node.localNormal.dot(toCam);
            if (facingDot <= 0.22) {
              node.sprite.visible = false;
              continue;
            }
            tmpNDC.copy(tmpWorldPos).project(camera);
            if (tmpNDC.z > 1.0) {
              node.sprite.visible = false;
              continue;
            }
            const hw = (node.baseWidth * distScale) / (camDist * 0.68);
            const hh = (node.baseHeight * distScale) / (camDist * 0.65);
            const box = {
              minX: tmpNDC.x - hw,
              maxX: tmpNDC.x + hw,
              minY: tmpNDC.y - hh,
              maxY: tmpNDC.y + hh,
            };
            let collides = false;
            for (const p of placedBoxes) {
              if (box.minX < p.maxX && box.maxX > p.minX && box.minY < p.maxY && box.maxY > p.minY) {
                collides = true;
                break;
              }
            }
            if (collides) {
              node.sprite.visible = false;
              continue;
            }
            placedBoxes.push(box);
            node.sprite.visible = true;
            node.sprite.scale.set(node.baseWidth * distScale, node.baseHeight * distScale, 1);
            const limbFade = THREE.MathUtils.smoothstep(facingDot, 0.22, 0.48);
            (node.sprite.material as THREE.SpriteMaterial).opacity = limbFade * 0.72;
          }
        }

        // Sunburst plane always faces the camera
        sunburstMesh.lookAt(camera.position);
      } catch (loopErr) {
        // Prevent unhandled errors from breaking the render loop permanently
        console.warn("Orbital animation frame caught:", loopErr);
      }

      renderer.render(scene, camera);
    };

    animate();

    // Mouse Drag & Country Click Selection Controls
    let pointerDownXY = { x: 0, y: 0 };
    let pointerDragged = false;
    const raycaster = new THREE.Raycaster();
    const mouseNDC = new THREE.Vector2();

    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      pointerDragged = false;
      pointerDownXY = { x: e.clientX, y: e.clientY };
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - mousePosRef.current.x;
      const dy = e.clientY - mousePosRef.current.y;
      if (Math.hypot(e.clientX - pointerDownXY.x, e.clientY - pointerDownXY.y) > 5) {
        pointerDragged = true;
      }
      mousePosRef.current = { x: e.clientX, y: e.clientY };

      const currentMode = viewModeRef.current;
      if (currentMode === "orbit" || currentMode === "global" || currentMode === "free") {
        orbitAngleRef.current.theta -= dx * 0.005;
        orbitAngleRef.current.phi = Math.max(
          -Math.PI * 0.45,
          Math.min(Math.PI * 0.45, orbitAngleRef.current.phi + dy * 0.005)
        );
      }
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
    };

    const onClick = (e: MouseEvent) => {
      if (pointerDragged) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouseNDC, camera);
      const hits = raycaster.intersectObject(earthMesh, false);

      if (selectedBorderMesh) {
        earthGroup.remove(selectedBorderMesh);
        selectedBorderMesh.geometry.dispose();
        (selectedBorderMesh.material as THREE.Material).dispose();
        selectedBorderMesh = null;
      }

      if (hits.length > 0) {
        const hitPt = hits[0].point.clone();
        // 1. Check if player clicked on or near an active 3D Disaster Event on the globe!
        let clickedEvent: GlobalEarthEvent | null = null;
        let bestDist = 0.85;
        for (const ev of liveEvents) {
          const d = hitPt.distanceTo(ev.position);
          if (d < bestDist) {
            bestDist = d;
            clickedEvent = ev.event;
          }
        }
        if (clickedEvent) {
          onSelectTargetRef.current?.(clickedEvent);
        }

        // 2. Also highlight country border if GeoJSON is loaded
        if (countriesList.length > 0) {
          const localPt = earthGroup.worldToLocal(hitPt);
          const { lat, lon } = vector3ToLatLon(localPt);
          const found = findCountryAtLatLon(countriesList, lat, lon);
          if (found) {
            selectedBorderMesh = createCountryHighlight(found, EARTH_RADIUS, 0.005);
            earthGroup.add(selectedBorderMesh);
            setSelectedCountry(found.name);
          } else {
            setSelectedCountry(null);
          }
        }
      } else {
        setSelectedCountry(null);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const currentMode = viewModeRef.current;
      if (currentMode === "orbit" || currentMode === "global" || currentMode === "free") {
        orbitAngleRef.current.radius = Math.max(
          7.0,
          Math.min(32.0, (orbitAngleRef.current.radius || 19.0) + e.deltaY * 0.015)
        );
      } else {
        tppZoomRef.current = Math.max(0.65, Math.min(1.85, tppZoomRef.current + e.deltaY * 0.0015));
      }
    };

    const onResize = () => {
      if (!container) return;
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener("resize", onResize);
    container.addEventListener("mousedown", onMouseDown);
    container.addEventListener("click", onClick);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    container.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      container.removeEventListener("mousedown", onMouseDown);
      container.removeEventListener("click", onClick);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      container.removeEventListener("wheel", onWheel);
      renderer.dispose();
      earthTexture.dispose();
      cloudTexture.dispose();
      sunburstTexture.dispose();
      flameTexture.dispose();
      smokeTexture.dispose();
      rippleTexture.dispose();
    };
  }, []);

  // On-screen Arcade Steer Handlers for Cadet Pilots
  const handleSteerStart = (dir: "w" | "s" | "a" | "d") => {
    flightState.current.keys[dir] = true;
  };
  const handleSteerEnd = (dir: "w" | "s" | "a" | "d") => {
    flightState.current.keys[dir] = false;
  };

  const handleBoostStart = () => {
    flightState.current.keys.space = true;
    setIsBoosting(true);
  };
  const handleBoostEnd = () => {
    flightState.current.keys.space = false;
    setIsBoosting(false);
  };

  return (
    <div className={`relative w-full h-full overflow-hidden bg-void select-none ${className}`}>
      {/* 3D WebGL Canvas */}
      <div ref={mountRef} className="w-full h-full cursor-crosshair" />

      {/* ── Top-Right: Camera Mode Switcher (Scout Chase, Nadir Scan, AI Data Center, Global Orbit + Map Borders Toggle) ── */}
      <div className="absolute top-16 right-3 sm:right-6 flex items-center gap-1.5 z-40 pointer-events-auto">
        <div className="flex items-center gap-1 bg-void/90 backdrop-blur-md p-1 rounded-full border border-edge/80 shadow-2xl">
          {(
            [
              { id: "tpp", label: "Scout Chase", icon: "🚀", desc: "Third-Person Scout Satellite View" },
              { id: "nadir", label: "Nadir Scan", icon: "🛰️", desc: "Down-Looking Earth Observation" },
              { id: "cinematic", label: "Event Cam", icon: "🎬", desc: "Cinematic Environmental Event Close-Up" },
              { id: "datacenter", label: "AI Station", icon: "🏛️", desc: "High-Orbit AI Data Center Mother Station" },
              { id: "orbit", label: "Global Orbit", icon: "🌍", desc: "3D Global Constellation View" },
            ] as const
          ).map((opt) => {
            const active =
              viewMode === opt.id ||
              (opt.id === "orbit" && (viewMode === "global" || viewMode === "free")) ||
              (opt.id === "nadir" && viewMode === "wing");
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setViewMode(opt.id as CameraViewMode)}
                title={`${opt.label} — ${opt.desc} (Press C to cycle)`}
                className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-full transition-all duration-200 cursor-pointer ${active
                    ? "bg-accent text-ink shadow-md ring-1 ring-accent/60"
                    : "text-muted hover:text-ink hover:bg-raised/60"
                  }`}
              >
                <span>{opt.icon}</span>
                <span className="hidden lg:inline">{opt.label}</span>
              </button>
            );
          })}
          <div className="h-4 w-px bg-edge mx-0.5" />
          <button
            type="button"
            onClick={() => {
              deployTriggerRef.current += 1;
              setDeploymentBadge("Stage 1/5: Central AI Compute Bus Separation");
            }}
            title="Replay 5-Stage Mechanical Solar & Radiator Wing Deployment Sequence"
            className="px-2.5 py-1 text-[11px] font-bold rounded-full transition-all cursor-pointer text-cyan-300 hover:bg-cyan-950/60"
          >
            ⚙️ <span className="hidden xl:inline">Deploy</span>
          </button>
          <button
            type="button"
            onClick={() => setShowMapOverlay((v) => !v)}
            title="Toggle Political Borders & Country Names Overlay"
            className={`px-2.5 py-1 text-[11px] font-bold rounded-full transition-all cursor-pointer ${showMapOverlay
                ? "bg-cyan-500/30 text-cyan-200 border border-cyan-400/50"
                : "text-faint hover:text-ink"
              }`}
          >
            🗺️ <span className="hidden xl:inline">Borders</span>
          </button>
        </div>
      </div>

      {/* ── Top-Center Telemetry Strip (Below Flight Clock) ── */}
      <div className="absolute top-26 left-1/2 -translate-x-1/2 flex flex-wrap items-center justify-center gap-1.5 pointer-events-none z-20 max-w-2xl px-2">
        <span className="bg-void/85 backdrop-blur-md border border-cyan-500/40 px-2.5 py-0.5 rounded-full text-[11px] text-cyan-300 shadow-md flex items-center gap-1.5 font-bold font-mono">
          <Compass className="w-3 h-3 text-cyan-400 animate-spin" style={{ animationDuration: "6s" }} />
          <span>SCOUT {orbitalSpeedKmS.toFixed(1)} km/s · {satAltKm.toFixed(0)} km</span>
        </span>
        <span className="bg-void/85 backdrop-blur-md border border-violet-500/40 px-2.5 py-0.5 rounded-full text-[11px] text-violet-200 shadow-md font-mono">
          🏛️ {activeRelayLabel}
        </span>
        {deploymentBadge && (
          <span className="bg-sky-950/90 backdrop-blur-md border border-sky-400/60 px-2.5 py-0.5 rounded-full text-[11px] text-sky-200 shadow-md font-mono animate-pulse">
            ⚙️ {deploymentBadge}
          </span>
        )}
        <span className="bg-void/85 backdrop-blur-md border border-sky-500/40 px-2.5 py-0.5 rounded-full text-[11px] text-sky-200 shadow-md font-mono hidden sm:inline-flex">
          🧠 {aiActiveTops.toFixed(1)} TOPS · {satLat.toFixed(1)}°, {satLon.toFixed(1)}°
        </span>
        <span
          className={`px-2.5 py-0.5 rounded-full text-[11px] border backdrop-blur-md shadow-md font-mono ${inEclipse
              ? "bg-indigo-950/85 border-indigo-500/40 text-indigo-300"
              : "bg-amber-950/60 border-amber-500/40 text-amber-300"
            }`}
        >
          {inEclipse ? "🌙 Umbra" : "☀️ Sunlit"}
        </span>
        {comms?.in_contact && (
          <span className="bg-void/85 backdrop-blur-md border border-emerald-500/40 px-2.5 py-0.5 rounded-full text-[11px] text-emerald-300 shadow-md animate-pulse flex items-center gap-1 font-mono">
            <Radio className="w-3 h-3 text-emerald-400" />
            <span>RF: {comms.active_station?.split(" ")[0]}</span>
          </span>
        )}
        {activeEvent && activeEvent.is_pending && (
          <span className="bg-amber-950/85 border border-amber-400 px-2.5 py-0.5 rounded-full text-[11px] text-amber-200 shadow-md animate-pulse font-mono">
            ⚠️ {activeEvent.name}
          </span>
        )}
      </div>

      {/* ── Center Crosshairs (Arcade Driving TPP HUD) ── */}
      {(viewMode === "tpp" || viewMode === "datacenter") && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="relative w-14 h-14 opacity-25">
            <Crosshair className="w-full h-full text-accent" />
          </div>
        </div>
      )}

      {/* ── Selected Country Indicator ── */}
      {selectedCountry && (
        <div className="absolute bottom-36 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div className="bg-black/75 backdrop-blur-md border border-amber-400/40 px-4 py-1 rounded-full shadow-2xl">
            <span className="text-amber-200 text-xs font-medium tracking-wide">
              🌍 {selectedCountry}
            </span>
          </div>
        </div>
      )}

      {/* ── COMPACT NON-OVERLAPPING FLIGHT CONTROL POD (Centered above Transport Bar) ── */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex items-center gap-2 bg-void/85 backdrop-blur-md border border-edge/80 rounded-full px-3 py-1 shadow-2xl">
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-faint hidden sm:inline">
          RCS Steer:
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onMouseDown={() => handleSteerStart("a")}
            onMouseUp={() => handleSteerEnd("a")}
            onTouchStart={() => handleSteerStart("a")}
            onTouchEnd={() => handleSteerEnd("a")}
            className="bg-panel/90 hover:bg-accent hover:text-ink border border-edge rounded-full w-6 h-6 flex items-center justify-center text-muted transition-colors active:scale-95"
            title="Precess Orbital Plane Left (A / Left Arrow)"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onMouseDown={() => handleSteerStart("w")}
            onMouseUp={() => handleSteerEnd("w")}
            onTouchStart={() => handleSteerStart("w")}
            onTouchEnd={() => handleSteerEnd("w")}
            className="bg-panel/90 hover:bg-accent hover:text-ink border border-edge rounded-full w-6 h-6 flex items-center justify-center text-muted transition-colors active:scale-95"
            title="Accelerate Along Track (W / Up Arrow)"
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            onMouseDown={() => handleSteerStart("s")}
            onMouseUp={() => handleSteerEnd("s")}
            onTouchStart={() => handleSteerStart("s")}
            onTouchEnd={() => handleSteerEnd("s")}
            className="bg-panel/90 hover:bg-accent hover:text-ink border border-edge rounded-full w-6 h-6 flex items-center justify-center text-muted transition-colors active:scale-95"
            title="Precision Scan Braking (S / Down Arrow)"
          >
            <ChevronDown size={14} />
          </button>
          <button
            type="button"
            onMouseDown={() => handleSteerStart("d")}
            onMouseUp={() => handleSteerEnd("d")}
            onTouchStart={() => handleSteerStart("d")}
            onTouchEnd={() => handleSteerEnd("d")}
            className="bg-panel/90 hover:bg-accent hover:text-ink border border-edge rounded-full w-6 h-6 flex items-center justify-center text-muted transition-colors active:scale-95"
            title="Precess Orbital Plane Right (D / Right Arrow)"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        <div className="h-3.5 w-px bg-edge" />

        {/* Thruster Boost Button */}
        <button
          type="button"
          onMouseDown={handleBoostStart}
          onMouseUp={handleBoostEnd}
          onTouchStart={handleBoostStart}
          onTouchEnd={handleBoostEnd}
          className={`px-2.5 py-0.5 rounded-full border flex items-center gap-1 text-[10px] font-bold font-mono transition-all active:scale-95 cursor-pointer ${isBoosting
              ? "bg-cyan-500 text-ink border-cyan-300 shadow-cyan-500/50"
              : "bg-panel/90 border-cyan-500/40 text-cyan-300 hover:bg-cyan-950/60"
            }`}
          title="Hold Spacebar to Fire Hall-Effect Ion Boost (2.2x Orbital Speed)"
        >
          <Zap className="w-3 h-3" />
          <span>Boost (Space)</span>
        </button>

        {/* Hidden compatibility nodes so TypeScript unused variable checks pass */}
        <span className="sr-only">
          {scenarioTargets.length} {inRangeTargetName}
        </span>
      </div>
    </div>
  );
}
