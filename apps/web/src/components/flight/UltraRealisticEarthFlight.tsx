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
  Flame,
  Radio,
} from "lucide-react";
import type { OrbitalTelemetry, CommsTelemetry, ClockState, ActiveEvent } from "../../types";
import {
  GROUND_STATIONS,
  calculateFootprintRadiusKm,
  haversineDistanceKm,
} from "../../lib/mission-geometry";

export interface UltraRealisticEarthFlightProps {
  orbital?: OrbitalTelemetry | null;
  comms?: CommsTelemetry | null;
  clock?: ClockState | null;
  scenarioId?: string;
  groundTrackPoints?: Array<{ latitude_deg: number; longitude_deg: number; altitude_km?: number }>;
  activeEvent?: ActiveEvent | null;
  className?: string;
}

export type CameraViewMode = "tpp" | "nadir" | "orbit" | "global" | "wing" | "free";

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

/** Procedural 3D Spacecraft Model with forward-facing (+Z) avionics, lateral (+/-X) solar wings, nadir (-Y) dish & sensors, and aft (-Z) ion thruster. */
function createSpacecraftModel(): THREE.Group {
  const ship = new THREE.Group();

  // 1. Central Avionics Bus: Length along Z (0.75), Width along X (0.5), Height along Y (0.42)
  const busMat = new THREE.MeshStandardMaterial({
    color: 0xcfd8dc,
    metalness: 0.85,
    roughness: 0.25,
  });
  const bus = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.75), busMat);
  ship.add(bus);

  // Gold Kapton Thermal Foil Wrap (central section)
  const foilMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    metalness: 0.95,
    roughness: 0.35,
  });
  const foil = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.44, 0.38), foilMat);
  ship.add(foil);

  // Radiator Panels on top (+Y space-facing)
  const radMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    metalness: 0.9,
    roughness: 0.1,
  });
  const radiator = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.02, 0.7), radMat);
  radiator.position.set(0, 0.22, 0);
  ship.add(radiator);

  // "TPP" Mission Insignia Plaque on the side flank (+X flank) matching real reference
  const plaqueCanvas = document.createElement("canvas");
  plaqueCanvas.width = 128;
  plaqueCanvas.height = 64;
  const pctx = plaqueCanvas.getContext("2d")!;
  pctx.fillStyle = "#1e293b";
  pctx.fillRect(0, 0, 128, 64);
  pctx.fillStyle = "#38bdf8";
  pctx.font = "bold 32px sans-serif";
  pctx.textAlign = "center";
  pctx.textBaseline = "middle";
  pctx.fillText("TPP", 64, 32);
  const plaqueTex = new THREE.CanvasTexture(plaqueCanvas);
  const plaqueMat = new THREE.MeshBasicMaterial({ map: plaqueTex });
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.12), plaqueMat);
  plaque.rotation.y = Math.PI / 2;
  plaque.position.set(0.255, 0.05, 0);
  ship.add(plaque);

  // 2. Dual Solar Array Wings extending laterally on +/- X
  const solarMat = new THREE.MeshStandardMaterial({
    color: 0x1d4ed8,
    metalness: 0.7,
    roughness: 0.2,
    emissive: 0x0f172a,
  });
  const wingFrameMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    metalness: 0.9,
    roughness: 0.3,
  });

  const wingPanelGeom = new THREE.BoxGeometry(0.85, 0.015, 0.42);

  // Right Wing (+X)
  const rightWingGroup = new THREE.Group();
  rightWingGroup.position.set(0.28, 0, 0);
  const rightBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2), busMat);
  rightBoom.rotation.z = Math.PI / 2;
  rightBoom.position.set(0.1, 0, 0);
  rightWingGroup.add(rightBoom);

  const rightPanel = new THREE.Mesh(wingPanelGeom, solarMat);
  rightPanel.position.set(0.62, 0, 0);
  rightWingGroup.add(rightPanel);

  const rightBorder = new THREE.Mesh(new THREE.BoxGeometry(0.87, 0.018, 0.44), wingFrameMat);
  rightBorder.position.set(0.62, 0, 0);
  rightBorder.scale.set(0.98, 0.8, 0.96);
  rightWingGroup.add(rightBorder);
  ship.add(rightWingGroup);

  // Left Wing (-X)
  const leftWingGroup = new THREE.Group();
  leftWingGroup.position.set(-0.28, 0, 0);
  const leftBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2), busMat);
  leftBoom.rotation.z = Math.PI / 2;
  leftBoom.position.set(-0.1, 0, 0);
  leftWingGroup.add(leftBoom);

  const leftPanel = new THREE.Mesh(wingPanelGeom, solarMat);
  leftPanel.position.set(-0.62, 0, 0);
  leftWingGroup.add(leftPanel);

  const leftBorder = new THREE.Mesh(new THREE.BoxGeometry(0.87, 0.018, 0.44), wingFrameMat);
  leftBorder.position.set(-0.62, 0, 0);
  leftBorder.scale.set(0.98, 0.8, 0.96);
  leftWingGroup.add(leftBorder);
  ship.add(leftWingGroup);

  // 3. Nadir High-Gain Parabolic Dish & Earth Sensors on -Y (Earth-facing)
  const dishMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    metalness: 0.3,
    roughness: 0.3,
  });
  const dish = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.08, 24, 1, true), dishMat);
  dish.rotation.x = 0; // pointing down along -Y
  dish.position.set(0, -0.26, 0.1);
  ship.add(dish);

  // Earth Imager Aperture lens (Nadir optical sensor on -Y)
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    roughness: 0.1,
    metalness: 0.9,
  });
  const imager = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 16), lensMat);
  imager.position.set(0, -0.22, -0.15);
  ship.add(imager);

  // 4. Forward Avionics Nose Cone at +Z (flight velocity direction)
  const noseMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    metalness: 0.9,
    roughness: 0.2,
  });
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.18, 16), noseMat);
  nose.rotation.x = Math.PI / 2; // points forward along +Z
  nose.position.set(0, 0, 0.44);
  ship.add(nose);

  // 5. Aft Ion Thruster Assembly at -Z
  const nozzleMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.95,
    roughness: 0.2,
  });
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.05, 0.16, 20), nozzleMat);
  nozzle.rotation.x = Math.PI / 2; // nozzle points backward along -Z
  nozzle.position.set(0, 0, -0.42);
  ship.add(nozzle);

  // Glowing Plasma Thruster Plume at -Z (expands backward along -Z)
  const plumeMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.95,
  });
  const plume = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.45, 16), plumeMat);
  plume.name = "thrusterPlume";
  plume.rotation.x = -Math.PI / 2; // cone points backward along -Z
  plume.position.set(0, 0, -0.68);
  ship.add(plume);

  ship.scale.set(0.7, 0.7, 0.7);
  return ship;
}

/**
 * Ultra-Realistic 3D Space Flight Game.
 *
 * Core Features:
 * - True Third-Person Perspective (TPP Chase) by default ("driving the satellite").
 * - Interactive Camera Switcher: TPP Chase, Ride-Along (Nadir), and Orbit View.
 * - Continuous 60 FPS orbital motion with player steering & boost (Arrow keys / WASD / C key / On-screen controls).
 * - Majestic Sun with radiant lens flare rays and solar corona.
 * - Spectacular live animated disasters across planet Earth (wildfires, volcanoes, floods, auroras, typhoons).
 * - Target-in-range laser lock and sound/HUD alerts.
 */
export function UltraRealisticEarthFlight({
  orbital,
  comms,
  scenarioId = "wildfire",
  groundTrackPoints = [],
  activeEvent,
  className = "",
}: UltraRealisticEarthFlightProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [viewMode, setViewMode] = useState<CameraViewMode>("tpp"); // DEFAULT TPP!
  const [inRangeTargetName, setInRangeTargetName] = useState<string | null>(null);
  const [isBoosting, setIsBoosting] = useState(false);
  const [orbitalSpeedKmS, setOrbitalSpeedKmS] = useState(7.6);

  // Flight Steering State (Allows player to actually DRIVE the spacecraft!)
  const flightState = useRef({
    progress: 0.8, // Continuous orbit angle
    speed: 0.0028, // Base continuous speed
    pitch: 0, // Player pitch steering
    yaw: 0, // Player yaw steering
    roll: 0, // Banking roll
    boost: false,
    keys: { w: false, s: false, a: false, d: false, space: false },
  });

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
          if (prev === "nadir" || prev === "wing") return "orbit";
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

    // 4. 3D Earth Globe
    const earthGroup = new THREE.Group();
    scene.add(earthGroup);

    const earthTexture = createEarthCanvasTexture();
    const earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS, 64, 64),
      new THREE.MeshStandardMaterial({ map: earthTexture, roughness: 0.55, metalness: 0.1 })
    );
    earthGroup.add(earthMesh);

    // 5. Cloud Layer Sphere
    const cloudTexture = createCloudCanvasTexture();
    const cloudMesh = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS + 0.05, 48, 48),
      new THREE.MeshStandardMaterial({ map: cloudTexture, transparent: true, opacity: 0.55, roughness: 0.9 })
    );
    earthGroup.add(cloudMesh);

    // 6. Glowing Atmospheric Limb Halo (Fresnel Shader)
    const atmoMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.68 - dot(vNormal, vec3(0, 0, 1.0)), 2.2);
          gl_FragColor = vec4(0.22, 0.65, 0.98, 1.0) * intensity * 1.6;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
    });
    const atmoMesh = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS + 0.18, 48, 48), atmoMat);
    scene.add(atmoMesh);

    // 7. Ground Stations on Earth
    GROUND_STATIONS.forEach((gs) => {
      const gsPos = latLonToVector3(gs.latitude, gs.longitude, EARTH_RADIUS + 0.03);
      const gsMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x10b981 })
      );
      gsMesh.position.copy(gsPos);
      scene.add(gsMesh);
    });

    // 8. Glowing Cyan Orbit Ring (Encircling Earth)
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
      new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 3, transparent: true, opacity: 0.88 })
    );
    scene.add(orbitLine);

    // 9. 3D Spacecraft Model
    const spacecraft = createSpacecraftModel();
    scene.add(spacecraft);

    // Footprint ground reticle
    const footprintMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.58, 32),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
    );
    scene.add(footprintMesh);

    // Targeting Laser Beam
    const targetBeam = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0x22c55e, linewidth: 3, transparent: true, opacity: 0 })
    );
    scene.add(targetBeam);

    // 10. ADVANCED SPECTACULAR LIVE DISASTER ANIMATIONS ON EARTH
    const flameTexture = createFlameSprite();
    const smokeTexture = createSmokeSprite();
    const rippleTexture = createRippleSprite();

    interface LiveEventVisual {
      event: GlobalEarthEvent;
      position: THREE.Vector3;
      group: THREE.Group;
      ringMesh: THREE.Mesh;
      flameParticles?: THREE.Points;
      flamePosis?: Float32Array;
      smokeParticles?: THREE.Points;
      smokePosis?: Float32Array;
      light?: THREE.PointLight;
      rippleMesh?: THREE.Mesh;
      auroraRibbon?: THREE.Mesh;
    }

    const liveEvents: LiveEventVisual[] = [];

    GLOBAL_EARTH_EVENTS.forEach((ev) => {
      const pos = latLonToVector3(ev.lat, ev.lon, EARTH_RADIUS + 0.02);
      const normal = pos.clone().normalize();
      const group = new THREE.Group();
      group.position.copy(pos);
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

      const color = new THREE.Color(ev.colorHex);

      // Pulsing Ground Hazard Ring
      const ringGeom = new THREE.RingGeometry(0.18, 0.3, 28);
      const ringMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      group.add(ringMesh);

      const visual: LiveEventVisual = { event: ev, position: pos, group, ringMesh };

      if (ev.type === "wildfire") {
        // 🔥 Wildfire: High-density rising flame particles + billowing smoke puffs + flickering terrain light
        const fCount = 80;
        const fGeom = new THREE.BufferGeometry();
        const fPosis = new Float32Array(fCount * 3);
        for (let i = 0; i < fCount; i++) {
          fPosis[i * 3] = (Math.random() - 0.5) * 0.18;
          fPosis[i * 3 + 1] = Math.random() * 0.5;
          fPosis[i * 3 + 2] = (Math.random() - 0.5) * 0.18;
        }
        fGeom.setAttribute("position", new THREE.BufferAttribute(fPosis, 3));
        const flameParticles = new THREE.Points(
          fGeom,
          new THREE.PointsMaterial({
            map: flameTexture,
            size: 0.28,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        group.add(flameParticles);
        visual.flameParticles = flameParticles;
        visual.flamePosis = fPosis;

        // Billowing Smoke Column
        const sCount = 50;
        const sGeom = new THREE.BufferGeometry();
        const sPosis = new Float32Array(sCount * 3);
        for (let i = 0; i < sCount; i++) {
          sPosis[i * 3] = (Math.random() - 0.5) * 0.3;
          sPosis[i * 3 + 1] = 0.3 + Math.random() * 0.7;
          sPosis[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
        }
        sGeom.setAttribute("position", new THREE.BufferAttribute(sPosis, 3));
        const smokeParticles = new THREE.Points(
          sGeom,
          new THREE.PointsMaterial({ map: smokeTexture, size: 0.42, transparent: true, opacity: 0.65, depthWrite: false })
        );
        group.add(smokeParticles);
        visual.smokeParticles = smokeParticles;
        visual.smokePosis = sPosis;

        const fireLight = new THREE.PointLight(0xf97316, 2.2, 3.0);
        fireLight.position.set(0, 0.25, 0);
        group.add(fireLight);
        visual.light = fireLight;
      } else if (ev.type === "volcano") {
        // 🌋 Volcano: Molten lava caldera + explosive magma sparks + ash umbrella cloud
        const caldera = new THREE.Mesh(
          new THREE.CircleGeometry(0.14, 16),
          new THREE.MeshBasicMaterial({ color: 0xff2200, side: THREE.DoubleSide })
        );
        caldera.rotation.x = Math.PI / 2;
        caldera.position.y = 0.01;
        group.add(caldera);

        const vCount = 65;
        const vGeom = new THREE.BufferGeometry();
        const vPosis = new Float32Array(vCount * 3);
        for (let i = 0; i < vCount; i++) {
          vPosis[i * 3] = (Math.random() - 0.5) * 0.15;
          vPosis[i * 3 + 1] = Math.random() * 0.85;
          vPosis[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
        }
        vGeom.setAttribute("position", new THREE.BufferAttribute(vPosis, 3));
        const flameParticles = new THREE.Points(
          vGeom,
          new THREE.PointsMaterial({ map: flameTexture, size: 0.22, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending })
        );
        group.add(flameParticles);
        visual.flameParticles = flameParticles;
        visual.flamePosis = vPosis;

        const volcLight = new THREE.PointLight(0xef4444, 2.0, 2.8);
        volcLight.position.set(0, 0.2, 0);
        group.add(volcLight);
        visual.light = volcLight;
      } else if (ev.type === "flood") {
        // 🌊 Flood: Expanding concentric water ripples
        const rippleMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(0.75, 0.75),
          new THREE.MeshBasicMaterial({ map: rippleTexture, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
        );
        rippleMesh.rotation.x = Math.PI / 2;
        group.add(rippleMesh);
        visual.rippleMesh = rippleMesh;
      } else if (ev.type === "solar_storm") {
        // ⚡ Polar Aurora: Undulating green/violet auroral ribbon curtains
        const ribbonGeom = new THREE.CylinderGeometry(0.4, 0.4, 0.55, 24, 1, true);
        const auroraRibbon = new THREE.Mesh(
          ribbonGeom,
          new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending })
        );
        auroraRibbon.position.y = 0.3;
        group.add(auroraRibbon);
        visual.auroraRibbon = auroraRibbon;
      }

      scene.add(group);
      liveEvents.push(visual);
    });

    // 11. CONTINUOUS 60 FPS ORBIT & PLAYER STEERING FLIGHT LOOP
    let animId: number;
    let clockTime = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      clockTime += 0.016;

      const fs = flightState.current;

      // ── Process Player Steering Controls ("Driving the Spaceship") ──
      const steerSpeed = 0.035;
      const returnSpeed = 0.04;

      if (fs.keys.w) fs.pitch = Math.max(-0.4, fs.pitch - steerSpeed);
      else if (fs.keys.s) fs.pitch = Math.min(0.4, fs.pitch + steerSpeed);
      else fs.pitch *= 1 - returnSpeed;

      if (fs.keys.a) {
        fs.yaw = Math.max(-0.45, fs.yaw - steerSpeed);
        fs.roll = Math.max(-0.6, fs.roll - steerSpeed * 1.5);
      } else if (fs.keys.d) {
        fs.yaw = Math.min(0.45, fs.yaw + steerSpeed);
        fs.roll = Math.min(0.6, fs.roll + steerSpeed * 1.5);
      } else {
        fs.yaw *= 1 - returnSpeed;
        fs.roll *= 1 - returnSpeed;
      }

      const speedMultiplier = fs.keys.space ? 2.5 : 1.0;
      setOrbitalSpeedKmS(fs.keys.space ? 19.0 : 7.6);

      // ── CONTINUOUS 60 FPS ORBIT MOTION (NEVER STOPS!) ──
      fs.progress += fs.speed * speedMultiplier;
      if (fs.progress >= Math.PI * 2) fs.progress -= Math.PI * 2;

      // Calculate continuous satellite position in 3D orbit
      const ox = Math.cos(fs.progress) * orbitRadius;
      const oy = Math.sin(fs.progress) * orbitRadius * Math.sin(Math.PI * 0.3) + fs.pitch * 0.5;
      const oz = Math.sin(fs.progress) * orbitRadius * Math.cos(Math.PI * 0.3) + fs.yaw * 0.5;
      spacecraft.position.set(ox, oy, oz);

      // Tangent vector along orbit (direction of flight)
      const tox = -Math.sin(fs.progress) * orbitRadius;
      const toy = Math.cos(fs.progress) * orbitRadius * Math.sin(Math.PI * 0.3);
      const toz = Math.cos(fs.progress) * orbitRadius * Math.cos(Math.PI * 0.3);
      const forwardDir = new THREE.Vector3(tox, toy, toz).normalize();

      const radialOut = spacecraft.position.clone().normalize();
      const radialDown = radialOut.clone().negate();
      const lateral = new THREE.Vector3().crossVectors(radialOut, forwardDir).normalize();

      // Orient spacecraft facing along velocity vector with +Z forward, +Y zenith, -Y nadir
      spacecraft.up.copy(radialOut);
      spacecraft.lookAt(spacecraft.position.clone().add(forwardDir));
      spacecraft.rotateX(-fs.pitch);
      spacecraft.rotateZ(-fs.roll);
      spacecraft.rotateY(fs.yaw);

      // Thruster plume flaring when boosting
      const plume = spacecraft.getObjectByName("thrusterPlume");
      if (plume) {
        const pScale = fs.keys.space ? 2.3 + 0.3 * Math.sin(clockTime * 25) : 1.0 + 0.15 * Math.sin(clockTime * 15);
        plume.scale.set(pScale, pScale, pScale);
      }

      // Footprint position on Earth surface below satellite
      const subSatPos = spacecraft.position.clone().normalize().multiplyScalar(EARTH_RADIUS + 0.02);
      footprintMesh.position.copy(subSatPos);
      footprintMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), subSatPos.clone().normalize());

      // Slow Earth & Cloud rotation
      cloudMesh.rotation.y = clockTime * 0.008;

      // ── Animate Live Disaster Events on Earth ──
      let acquiredTarget: string | null = null;
      const footprintKm = calculateFootprintRadiusKm(satAltKm, 30.0);

      liveEvents.forEach((ev, idx) => {
        // Pulse ground hazard circle
        const pulse = 1.0 + 0.22 * Math.sin(clockTime * 4.5 + idx);
        ev.ringMesh.scale.set(pulse, pulse, pulse);

        // Animate Wildfire / Volcano Particles
        if (ev.flameParticles && ev.flamePosis) {
          const arr = ev.flamePosis;
          const count = arr.length / 3;
          for (let i = 0; i < count; i++) {
            arr[i * 3 + 1] += 0.02; // Upward thermal speed
            arr[i * 3] += Math.sin(clockTime * 8 + i) * 0.004;
            if (arr[i * 3 + 1] > 0.65) {
              arr[i * 3] = (Math.random() - 0.5) * 0.18;
              arr[i * 3 + 1] = 0;
              arr[i * 3 + 2] = (Math.random() - 0.5) * 0.18;
            }
          }
          (ev.flameParticles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        }

        if (ev.smokeParticles && ev.smokePosis) {
          const arr = ev.smokePosis;
          const count = arr.length / 3;
          for (let i = 0; i < count; i++) {
            arr[i * 3 + 1] += 0.014;
            arr[i * 3] += Math.cos(clockTime * 5 + i) * 0.005;
            if (arr[i * 3 + 1] > 1.1) {
              arr[i * 3] = (Math.random() - 0.5) * 0.3;
              arr[i * 3 + 1] = 0.3;
              arr[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
            }
          }
          (ev.smokeParticles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        }

        // Animate Flood Water Ripple Expansion
        if (ev.rippleMesh) {
          const rippleScale = 1.0 + ((clockTime * 0.85 + idx * 0.4) % 1.6);
          ev.rippleMesh.scale.set(rippleScale, rippleScale, rippleScale);
          (ev.rippleMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0.2, 1.0 - (rippleScale - 1.0) / 1.6);
        }

        // Animate Polar Aurora Wave
        if (ev.auroraRibbon) {
          const wave = Math.sin(clockTime * 3.2 + idx) * 0.1;
          ev.auroraRibbon.scale.set(1.0 + wave, 1.0 + wave * 1.5, 1.0 + wave);
        }

        // Fire / Volcano Flickering Light
        if (ev.light) {
          ev.light.intensity = 1.8 + 0.7 * Math.sin(clockTime * 15.0 + idx * 3.0);
        }

        // Proximity detection to satellite
        const dKm = haversineDistanceKm(satLat, satLon, ev.event.lat, ev.event.lon);
        if (dKm <= footprintKm) {
          acquiredTarget = ev.event.name;
          (ev.ringMesh.material as THREE.MeshBasicMaterial).color.setHex(0x22c55e);

          // Connect targeting laser beam from satellite to ground disaster site
          targetBeam.geometry.setFromPoints([spacecraft.position, ev.position]);
          (targetBeam.material as THREE.LineBasicMaterial).opacity = 0.95;
        } else {
          (ev.ringMesh.material as THREE.MeshBasicMaterial).color.setHex(
            parseInt(ev.event.colorHex.replace("#", ""), 16)
          );
        }
      });

      if (!acquiredTarget) {
        (targetBeam.material as THREE.LineBasicMaterial).opacity = 0;
      }
      setInRangeTargetName(acquiredTarget);

      // ── 12. CAMERA MODES: TPP CHASE BY DEFAULT, NADIR RIDE-ALONG, ORBIT VIEW ──
      const currentMode = viewModeRef.current;
      const targetCamPos = new THREE.Vector3();
      const targetLookAt = new THREE.Vector3();
      const targetCamUp = new THREE.Vector3();

      if (currentMode === "tpp") {
        // 🚀 Third-Person Perspective (TPP Chase):
        // Positioned behind and slightly above the spacecraft, with a gentle lateral offset
        // so the satellite is prominently framed in the foreground and Earth fills the background (matching Image 5)
        const zoom = tppZoomRef.current;
        const chaseBehind = forwardDir.clone().multiplyScalar(-3.0 * zoom);
        const chaseUp = radialOut.clone().multiplyScalar(1.25 * zoom);
        const chaseSide = lateral.clone().multiplyScalar(0.75 * zoom);

        targetCamPos.copy(spacecraft.position).add(chaseBehind).add(chaseUp).add(chaseSide);

        // Look ahead past the spacecraft nose down toward Earth's horizon and the orbit ring ahead
        targetLookAt.copy(spacecraft.position)
          .add(forwardDir.clone().multiplyScalar(1.4))
          .add(radialDown.clone().multiplyScalar(0.45));

        // Up is radial outward: keeps Earth beneath the horizon consistently without gimbal tumbling
        targetCamUp.copy(radialOut);
      } else if (currentMode === "nadir" || currentMode === "wing") {
        // 🛰️ Ride-Along (Nadir):
        // Satellite observation camera looking directly down at Earth below, with spacecraft in frame
        const nadirPos = spacecraft.position.clone()
          .add(radialOut.clone().multiplyScalar(1.9))
          .add(lateral.clone().multiplyScalar(0.55));

        targetCamPos.copy(nadirPos);

        // Point directly down at the sub-satellite point on Earth's surface
        const subSatPos = spacecraft.position.clone().normalize().multiplyScalar(EARTH_RADIUS);
        targetLookAt.copy(subSatPos);

        // Up along flight direction: Earth surface scrolls forward beneath the satellite
        targetCamUp.copy(forwardDir);
      } else {
        // 🌍 Orbit View ("orbit" or "global" or "free"):
        // Grand panoramic 3D view of planet Earth, complete glowing orbit ring, and all disasters
        const rad = orbitAngleRef.current.radius || 19.0;
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

      // Smooth camera interpolation (lerp)
      const lerpSpeed = currentMode === "orbit" ? 0.08 : 0.12;
      camPosRef.current.lerp(targetCamPos, lerpSpeed);
      camLookAtRef.current.lerp(targetLookAt, lerpSpeed);
      camUpRef.current.lerp(targetCamUp, lerpSpeed);

      camera.position.copy(camPosRef.current);
      camera.up.copy(camUpRef.current);
      camera.lookAt(camLookAtRef.current);

      // Sunburst plane always faces the camera
      sunburstMesh.lookAt(camera.position);

      renderer.render(scene, camera);
    };

    animate();

    // Mouse Drag Controls (When in Free/Orbit mode)
    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - mousePosRef.current.x;
      const dy = e.clientY - mousePosRef.current.y;
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

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const currentMode = viewModeRef.current;
      if (currentMode === "orbit" || currentMode === "global" || currentMode === "free") {
        orbitAngleRef.current.radius = Math.max(
          11.0,
          Math.min(32.0, (orbitAngleRef.current.radius || 19.0) + e.deltaY * 0.02)
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
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    container.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      container.removeEventListener("mousedown", onMouseDown);
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

      {/* ── Top-Right: Camera Mode Switcher (TPP Chase, Ride-Along Nadir, Orbit View) ── */}
      <div className="absolute top-16 right-3 sm:right-6 flex flex-col items-end gap-1.5 z-40 pointer-events-auto">
        <div className="flex items-center gap-1 bg-void/90 backdrop-blur-md p-1.5 rounded-full border border-edge/80 shadow-2xl">
          {(
            [
              { id: "tpp", label: "TPP Chase", icon: "🚀", desc: "Third-Person Pilot View" },
              { id: "nadir", label: "Ride-Along (Nadir)", icon: "🛰️", desc: "Down-Looking Earth Observation" },
              { id: "orbit", label: "Orbit View", icon: "🌍", desc: "3D Global Orbit View" },
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
                title={`${opt.label} — ${opt.desc} (Press C to switch)`}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full transition-all duration-200 ${
                  active
                    ? "bg-accent text-ink shadow-md ring-1 ring-accent/60 scale-[1.02]"
                    : "text-muted hover:text-ink hover:bg-raised/60"
                }`}
              >
                <span>{opt.icon}</span>
                <span className="hidden sm:inline">{opt.label}</span>
                <span className="sm:hidden">{opt.label.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>
        <div className="text-[10px] text-faint font-mono mr-2 flex items-center gap-1">
          <span>Toggle key:</span>
          <kbd className="px-1.5 py-0.5 rounded bg-raised border border-edge text-muted text-[10px] font-bold">C</kbd>
        </div>
      </div>

      {/* ── Live Orbital Status & Speedometer ── */}
      <div className="absolute top-48 left-3 flex flex-wrap items-center gap-2 pointer-events-none z-20 max-w-sm">
        <span className="bg-void/85 backdrop-blur-md border border-cyan-500/40 px-3 py-1 rounded-full text-xs text-cyan-300 shadow-md flex items-center gap-1.5 font-bold font-mono">
          <Compass className="w-3.5 h-3.5 text-cyan-400 animate-spin" style={{ animationDuration: "6s" }} />
          <span>VEL: {orbitalSpeedKmS.toFixed(1)} km/s</span>
        </span>
        <span
          className={`px-3 py-1 rounded-full text-xs border backdrop-blur-md shadow-md ${
            inEclipse
              ? "bg-indigo-950/85 border-indigo-500/40 text-indigo-300"
              : "bg-amber-950/60 border-amber-500/40 text-amber-300"
          }`}
        >
          {inEclipse ? "🌙 Umbra (Night)" : "☀️ Sunlit Flight"}
        </span>
        {comms?.in_contact && (
          <span className="bg-void/85 backdrop-blur-md border border-emerald-500/40 px-3 py-1 rounded-full text-xs text-emerald-300 shadow-md animate-pulse flex items-center gap-1">
            <Radio className="w-3 h-3 text-emerald-400" />
            <span>Downlink: {comms.active_station?.split(" ")[0]}!</span>
          </span>
        )}
        {activeEvent && activeEvent.is_pending && (
          <span className="bg-amber-950/85 border border-amber-400 px-3 py-1 rounded-full text-xs text-amber-200 shadow-md animate-pulse">
            ⚠️ CRISIS ALERT: {activeEvent.name}
          </span>
        )}
      </div>

      {/* ── Center Crosshairs (Arcade Driving TPP HUD) ── */}
      {viewMode === "tpp" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="relative w-16 h-16 opacity-35">
            <Crosshair className="w-full h-full text-accent" />
          </div>
        </div>
      )}

      {/* ── Center Alert: Live Target Acquired! ── */}
      {inRangeTargetName && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="bg-emerald-950/90 border border-emerald-400 px-5 py-2.5 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2.5 animate-bounce">
            <Flame className="w-4 h-4 text-emerald-300 animate-pulse" />
            <span className="text-xs sm:text-sm font-bold text-emerald-200">
              TARGET IN SENSOR CONE: {inRangeTargetName} — Ready to photograph!
            </span>
          </div>
        </div>
      )}

      {/* ── ARCADE FLIGHT CONTROLS ("DRIVING THE SATELLITE") ── */}
      <div className="absolute bottom-20 left-4 z-20 pointer-events-auto flex items-end gap-3">
        {/* Virtual D-Pad Flight Stick */}
        <div className="bg-void/85 backdrop-blur-md border border-edge/80 rounded-2xl p-2.5 shadow-2xl">
          <div className="text-[10px] text-faint font-bold text-center uppercase tracking-wider mb-1">
            Steer (WASD)
          </div>
          <div className="grid grid-cols-3 gap-1 w-28 h-28">
            <div />
            <button
              type="button"
              onMouseDown={() => handleSteerStart("w")}
              onMouseUp={() => handleSteerEnd("w")}
              onTouchStart={() => handleSteerStart("w")}
              onTouchEnd={() => handleSteerEnd("w")}
              className="bg-panel/80 hover:bg-accent hover:text-ink border border-edge rounded-lg flex items-center justify-center text-muted transition-colors active:scale-95"
              title="Pitch Down"
            >
              <ChevronUp size={20} />
            </button>
            <div />

            <button
              type="button"
              onMouseDown={() => handleSteerStart("a")}
              onMouseUp={() => handleSteerEnd("a")}
              onTouchStart={() => handleSteerStart("a")}
              onTouchEnd={() => handleSteerEnd("a")}
              className="bg-panel/80 hover:bg-accent hover:text-ink border border-edge rounded-lg flex items-center justify-center text-muted transition-colors active:scale-95"
              title="Bank Left"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex items-center justify-center">
              <span className="w-2.5 h-2.5 rounded-full bg-accent/60" />
            </div>
            <button
              type="button"
              onMouseDown={() => handleSteerStart("d")}
              onMouseUp={() => handleSteerEnd("d")}
              onTouchStart={() => handleSteerStart("d")}
              onTouchEnd={() => handleSteerEnd("d")}
              className="bg-panel/80 hover:bg-accent hover:text-ink border border-edge rounded-lg flex items-center justify-center text-muted transition-colors active:scale-95"
              title="Bank Right"
            >
              <ChevronRight size={20} />
            </button>

            <div />
            <button
              type="button"
              onMouseDown={() => handleSteerStart("s")}
              onMouseUp={() => handleSteerEnd("s")}
              onTouchStart={() => handleSteerStart("s")}
              onTouchEnd={() => handleSteerEnd("s")}
              className="bg-panel/80 hover:bg-accent hover:text-ink border border-edge rounded-lg flex items-center justify-center text-muted transition-colors active:scale-95"
              title="Pitch Up"
            >
              <ChevronDown size={20} />
            </button>
            <div />
          </div>
        </div>

        {/* Thruster Boost Button */}
        <button
          type="button"
          onMouseDown={handleBoostStart}
          onMouseUp={handleBoostEnd}
          onTouchStart={handleBoostStart}
          onTouchEnd={handleBoostEnd}
          className={`h-28 px-4 rounded-2xl border flex flex-col items-center justify-center gap-1 font-bold transition-all shadow-2xl active:scale-95 ${
            isBoosting
              ? "bg-cyan-500 text-ink border-cyan-300 shadow-cyan-500/50 scale-105"
              : "bg-void/85 backdrop-blur-md border-cyan-500/40 text-cyan-300 hover:bg-cyan-950/60"
          }`}
          title="Hold Spacebar to Boost Thrusters"
        >
          <Zap className={`w-6 h-6 ${isBoosting ? "animate-bounce text-ink" : "text-cyan-400"}`} />
          <span className="text-[11px] uppercase tracking-wider">Boost</span>
          <span className="text-[9px] opacity-70 font-mono">(Space)</span>
        </button>
      </div>

      {/* ── Active Earth Events Catalog Card ── */}
      <div className="absolute bottom-20 right-4 z-20 pointer-events-none hidden md:block max-w-xs">
        <div className="bg-void/85 backdrop-blur-md border border-edge/80 rounded-2xl p-3 text-xs space-y-1.5 shadow-xl">
          <div className="flex items-center justify-between border-b border-edge/60 pb-1.5">
            <span className="font-bold text-ink uppercase tracking-wider text-[10px] text-faint">
              Active Earth Events
            </span>
            <span className="text-[10px] text-accent font-semibold">
              {GLOBAL_EARTH_EVENTS.length} Worldwide
            </span>
          </div>
          <div className="space-y-1 max-h-36 overflow-hidden">
            {scenarioTargets.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-1.5 truncate">
                  <span
                    className="w-2 h-2 rounded-full shrink-0 animate-ping"
                    style={{ backgroundColor: t.colorHex }}
                  />
                  <span className="text-ink font-semibold truncate">{t.name}</span>
                </div>
                <span className="text-amber-400 font-mono text-[10px] shrink-0">{t.intensity}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
