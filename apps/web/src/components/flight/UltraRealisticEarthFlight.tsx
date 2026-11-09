import { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
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

export type CameraViewMode = "global" | "chase" | "wing" | "free";

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

/** Comprehensive, dynamic catalog of global disaster events on Earth. */
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
    badge: "🔥 Wildfire Front",
    intensity: "850 MW",
    description: "Intense canopy wildfire raging across ridge line",
  },
  {
    id: "wf_gippsland",
    name: "Gippsland Firestorm",
    type: "wildfire",
    scenarioId: "wildfire",
    lat: -37.5,
    lon: 147.2,
    colorHex: "#f97316",
    badge: "🔥 Wildfire Front",
    intensity: "620 MW",
    description: "Rapidly spreading wildfire flank with spotting embers",
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
    description: "Widespread tropical rainforest firestorm with towering smoke",
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
    badge: "🔥 Taiga Firestorm",
    intensity: "710 MW",
    description: "Subarctic peat and coniferous forest inferno",
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
    description: "Active stratovolcano with pyroclastic flow & 14 km ash plume",
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
    badge: "🌊 River Flood",
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

/** Convert latitude (-90..+90) and longitude (-180..+180) to Three.js Cartesian coordinates. */
function latLonToVector3(latDeg: number, lonDeg: number, radius: number): THREE.Vector3 {
  const phi = (latDeg * Math.PI) / 180;
  const theta = ((lonDeg + 180) * Math.PI) / 180;
  const x = -radius * Math.cos(phi) * Math.cos(theta);
  const y = radius * Math.sin(phi);
  const z = radius * Math.cos(phi) * Math.sin(theta);
  return new THREE.Vector3(x, y, z);
}

/** Create procedural Earth texture with detailed continents, shallow coasts, and night lights. */
function createEarthCanvasTexture(): THREE.CanvasTexture {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // 1. Deep Ocean Base with realistic color gradient
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

  function drawLandmass(
    coords: Array<[number, number]>,
    baseColor: string,
    desertRegion?: { center: [number, number]; radius: number }
  ) {
    if (!ctx || coords.length === 0) return;

    // Turquoise shallow shelf coast
    ctx.beginPath();
    ctx.moveTo(toX(coords[0][1]), toY(coords[0][0]));
    for (let i = 1; i < coords.length; i++) {
      ctx.lineTo(toX(coords[i][1]), toY(coords[i][0]));
    }
    ctx.closePath();
    ctx.lineWidth = 14;
    ctx.strokeStyle = "rgba(14, 116, 144, 0.4)";
    ctx.stroke();

    // Land surface
    ctx.fillStyle = baseColor;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#1e3a1e";
    ctx.stroke();

    if (desertRegion) {
      const cx = toX(desertRegion.center[1]);
      const cy = toY(desertRegion.center[0]);
      const rad = desertRegion.radius * (width / 360);
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

  // Draw Continents
  drawLandmass(
    [
      [70, -165], [72, -130], [60, -85], [52, -55], [44, -64], [30, -81],
      [25, -80], [18, -95], [15, -92], [9, -78], [14, -87], [22, -105],
      [32, -117], [38, -123], [48, -125], [58, -136], [60, -148], [65, -168],
    ],
    "#2e5631",
    { center: [34, -112], radius: 16 }
  );

  drawLandmass(
    [
      [12, -72], [10, -62], [4, -51], [-3, -38], [-12, -37], [-23, -42],
      [-34, -53], [-42, -64], [-54, -67], [-52, -74], [-38, -73], [-24, -70],
      [-12, -77], [-4, -81], [5, -77],
    ],
    "#224a26",
    { center: [-23, -68], radius: 10 }
  );

  drawLandmass(
    [
      [71, 28], [68, 44], [72, 70], [77, 105], [70, 140], [66, 170],
      [60, 162], [52, 141], [40, 128], [32, 121], [22, 114], [21, 107],
      [10, 105], [8, 98], [22, 89], [22, 70], [25, 62], [14, 53],
      [12, 44], [30, 32], [36, 36], [42, 28], [36, -5], [43, -9],
      [48, -4], [54, 8], [58, 6], [62, 5], [70, 20],
    ],
    "#345b36",
    { center: [28, 48], radius: 24 }
  );

  drawLandmass(
    [
      [36, 10], [32, 32], [28, 34], [12, 51], [2, 45], [-11, 40],
      [-26, 33], [-34, 26], [-34, 18], [-22, 14], [-6, 12], [4, 9],
      [5, 1], [4, -7], [12, -16], [21, -17], [30, -10], [36, -5],
    ],
    "#3a5830",
    { center: [22, 18], radius: 22 }
  );

  drawLandmass(
    [
      [-12, 131], [-12, 136], [-17, 141], [-11, 142], [-22, 150], [-32, 153],
      [-38, 147], [-38, 140], [-32, 132], [-35, 118], [-32, 115], [-22, 114],
      [-15, 124],
    ],
    "#8a5d3b",
    { center: [-25, 134], radius: 18 }
  );

  // Polar ice
  drawLandmass([[76, -68], [83, -30], [81, -18], [65, -40], [60, -45], [70, -55]], "#e2e8f0");
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(0, toY(-65), width, height - toY(-65));

  // Golden City Lights
  ctx.fillStyle = "rgba(253, 224, 71, 0.88)";
  const cityClusters: Array<[number, number, number]> = [
    [40, -74, 20], [34, -118, 18], [41, -87, 16], [51, 0, 24],
    [48, 2, 22], [35, 139, 28], [31, 121, 26], [28, 77, 26],
    [22, 88, 20], [-33, 151, 14], [-23, -43, 16], [-34, -58, 14],
    [30, 31, 18], [25, 55, 16], [1, 103, 16],
  ];
  cityClusters.forEach(([lat, lon, count]) => {
    const cx = toX(lon);
    const cy = toY(lat);
    for (let i = 0; i < count; i++) {
      const rx = cx + (Math.random() - 0.5) * 35;
      const ry = cy + (Math.random() - 0.5) * 25;
      const size = Math.random() * 2.2 + 0.6;
      ctx.beginPath();
      ctx.arc(rx, ry, size, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** Create dynamic procedural Cloud texture. */
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

/** Glowing circular flame sprite for particle rendering. */
function createFlameSprite(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  grad.addColorStop(0, "rgba(255, 255, 255, 1)");
  grad.addColorStop(0.2, "rgba(254, 240, 138, 0.95)");
  grad.addColorStop(0.5, "rgba(249, 115, 22, 0.7)");
  grad.addColorStop(0.8, "rgba(239, 68, 68, 0.3)");
  grad.addColorStop(1, "rgba(239, 68, 68, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/** Soft dark billowing smoke sprite. */
function createSmokeSprite(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  grad.addColorStop(0, "rgba(75, 85, 99, 0.7)");
  grad.addColorStop(0.5, "rgba(55, 65, 81, 0.4)");
  grad.addColorStop(1, "rgba(31, 41, 55, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/** Concentric ripple water wave sprite for floods. */
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

/** Procedural 3D Spacecraft Model (Lumen-1 / TPP). */
function createSpacecraftModel(): THREE.Group {
  const ship = new THREE.Group();

  // 1. Central bus
  const busMat = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.85, roughness: 0.25 });
  const bus = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.4), busMat);
  ship.add(bus);

  // 2. Gold MLI thermal foil blanket wrap
  const foilMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.95, roughness: 0.35 });
  const foil = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.22, 0.42), foilMat);
  ship.add(foil);

  // 3. Solar Panel Wings (Port & Starboard)
  const solarMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, metalness: 0.65, roughness: 0.2 });
  const wingGeom = new THREE.BoxGeometry(0.35, 0.02, 0.9);

  const rightWing = new THREE.Mesh(wingGeom, solarMat);
  rightWing.position.set(0, 0, 0.7);
  ship.add(rightWing);

  const leftWing = new THREE.Mesh(wingGeom, solarMat);
  leftWing.position.set(0, 0, -0.7);
  ship.add(leftWing);

  // Wing struts
  const strutMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 });
  const strutGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.5);

  const rightStrut = new THREE.Mesh(strutGeom, strutMat);
  rightStrut.rotation.x = Math.PI / 2;
  rightStrut.position.set(0, 0, 0.3);
  ship.add(rightStrut);

  const leftStrut = new THREE.Mesh(strutGeom, strutMat);
  leftStrut.rotation.x = Math.PI / 2;
  leftStrut.position.set(0, 0, -0.3);
  ship.add(leftStrut);

  // 4. Parabolic High-Gain Dish Antenna
  const dishMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
  const dish = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.08, 24, 1, true), dishMat);
  dish.rotation.x = Math.PI;
  dish.position.set(0, -0.28, 0);
  ship.add(dish);

  // 5. Thruster Engine Nozzle with glowing plume
  const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9 });
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.04, 0.12, 16), nozzleMat);
  nozzle.rotation.z = Math.PI / 2;
  nozzle.position.set(-0.3, 0, 0);
  ship.add(nozzle);

  const plumeMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.85 });
  const plume = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 16), plumeMat);
  plume.rotation.z = -Math.PI / 2;
  plume.position.set(-0.5, 0, 0);
  ship.add(plume);

  ship.scale.set(0.65, 0.65, 0.65);
  return ship;
}

/**
 * Ultra-Realistic, High-Performance 3D Flight Experience.
 *
 * Upgraded Features:
 * - Buttery-smooth locked 60 FPS motion (lerped interpolation, zero WebGL context recreations).
 * - Live animated disaster events across planet Earth (flames, billowing smoke, volcanic magma bursts, water ripples, auroras).
 * - Comprehensive global event network across continents.
 * - Glowing neon orbit ring, Sun with corona & lens flare, deep space starfield.
 * - Targeting laser beam and HUD prompt when in range.
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
  const [viewMode, setViewMode] = useState<CameraViewMode>("global");
  const [inRangeTargetName, setInRangeTargetName] = useState<string | null>(null);

  // Position interpolation refs for silky smooth 60 FPS motion
  const targetPosRef = useRef(new THREE.Vector3(0, 0, EARTH_RADIUS + 0.75));
  const currentPosRef = useRef(new THREE.Vector3(0, 0, EARTH_RADIUS + 0.75));
  const isDraggingRef = useRef(false);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const orbitAngleRef = useRef({ theta: 0.65, phi: 0.35 });
  const viewModeRef = useRef<CameraViewMode>("global");
  viewModeRef.current = viewMode;

  const satLat = orbital?.latitude_deg ?? -33.8;
  const satLon = orbital?.longitude_deg ?? 145.0;
  const satAltKm = orbital?.altitude_km ?? 550.0;
  const inEclipse = orbital?.in_eclipse ?? false;

  const orbitRadius = EARTH_RADIUS + 0.75;

  // Keep target position updated smoothly without touching Three.js scene
  useEffect(() => {
    targetPosRef.current = latLonToVector3(satLat, satLon, orbitRadius);
  }, [satLat, satLon, orbitRadius]);

  // Filter primary mission targets
  const scenarioTargets = useMemo(() => {
    return GLOBAL_EARTH_EVENTS.filter((e) => e.scenarioId === scenarioId);
  }, [scenarioId]);

  // ── Main Scene Initialization (Runs ONCE on mount) ──────────────────────────
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020408);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(13.5, 7.5, 15.0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.replaceChildren(renderer.domElement);

    // 2. Starfield in Deep Space
    const starsCount = 2400;
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

    const starMat = new THREE.PointsMaterial({ size: 1.2, vertexColors: true, transparent: true, opacity: 0.9 });
    const stars = new THREE.Points(starGeom, starMat);
    scene.add(stars);

    // 3. The Brilliant Sun in Space
    const sunPos = new THREE.Vector3(26, 12, 18);
    const sunLight = new THREE.DirectionalLight(0xfffbeb, 3.2);
    sunLight.position.copy(sunPos);
    scene.add(sunLight);

    const ambientLight = new THREE.AmbientLight(0x0e1726, 0.45);
    scene.add(ambientLight);

    const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(1.8, 32, 32), new THREE.MeshBasicMaterial({ color: 0xfff7ed }));
    sunMesh.position.copy(sunPos);
    scene.add(sunMesh);

    const coronaGeom = new THREE.RingGeometry(1.8, 4.2, 48);
    const coronaMat = new THREE.MeshBasicMaterial({ color: 0xfef08a, side: THREE.DoubleSide, transparent: true, opacity: 0.35 });
    const coronaMesh = new THREE.Mesh(coronaGeom, coronaMat);
    coronaMesh.position.copy(sunPos);
    scene.add(coronaMesh);

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

    // 6. Glowing Atmospheric Limb Halo
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
          gl_FragColor = vec4(0.22, 0.65, 0.98, 1.0) * intensity * 1.5;
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

    // 8. Glowing Cyan Orbit Ring (Encircling Earth, matching Picture 2)
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

    // Spacecraft footprint ground reticle
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

    // 10. ADVANCED LIVE ANIMATED DISASTER EVENTS ON EARTH
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
      const ringGeom = new THREE.RingGeometry(0.18, 0.28, 28);
      const ringMat = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      });
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      group.add(ringMesh);

      const visual: LiveEventVisual = { event: ev, position: pos, group, ringMesh };

      if (ev.type === "wildfire") {
        // 🔥 Wildfire: Animated rising flame particles + billowing smoke column + flickering fire light
        const fCount = 60;
        const fGeom = new THREE.BufferGeometry();
        const fPosis = new Float32Array(fCount * 3);
        for (let i = 0; i < fCount; i++) {
          fPosis[i * 3] = (Math.random() - 0.5) * 0.15;
          fPosis[i * 3 + 1] = Math.random() * 0.45;
          fPosis[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
        }
        fGeom.setAttribute("position", new THREE.BufferAttribute(fPosis, 3));
        const fMat = new THREE.PointsMaterial({
          map: flameTexture,
          size: 0.22,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const flameParticles = new THREE.Points(fGeom, fMat);
        group.add(flameParticles);
        visual.flameParticles = flameParticles;
        visual.flamePosis = fPosis;

        // Billowing Smoke Puff Column
        const sCount = 40;
        const sGeom = new THREE.BufferGeometry();
        const sPosis = new Float32Array(sCount * 3);
        for (let i = 0; i < sCount; i++) {
          sPosis[i * 3] = (Math.random() - 0.5) * 0.25;
          sPosis[i * 3 + 1] = 0.3 + Math.random() * 0.6;
          sPosis[i * 3 + 2] = (Math.random() - 0.5) * 0.25;
        }
        sGeom.setAttribute("position", new THREE.BufferAttribute(sPosis, 3));
        const sMat = new THREE.PointsMaterial({
          map: smokeTexture,
          size: 0.35,
          transparent: true,
          opacity: 0.6,
          depthWrite: false,
        });
        const smokeParticles = new THREE.Points(sGeom, sMat);
        group.add(smokeParticles);
        visual.smokeParticles = smokeParticles;
        visual.smokePosis = sPosis;

        // Flickering fire light casting on surrounding terrain
        const fireLight = new THREE.PointLight(0xf97316, 2.0, 2.5);
        fireLight.position.set(0, 0.2, 0);
        group.add(fireLight);
        visual.light = fireLight;
      } else if (ev.type === "volcano") {
        // 🌋 Volcano: Molten lava caldera + explosive magma bombs + ash plume
        const calderaGeom = new THREE.CircleGeometry(0.12, 16);
        const calderaMat = new THREE.MeshBasicMaterial({ color: 0xff2200, side: THREE.DoubleSide });
        const caldera = new THREE.Mesh(calderaGeom, calderaMat);
        caldera.rotation.x = Math.PI / 2;
        caldera.position.y = 0.01;
        group.add(caldera);

        // Explosive magma particles
        const vCount = 55;
        const vGeom = new THREE.BufferGeometry();
        const vPosis = new Float32Array(vCount * 3);
        for (let i = 0; i < vCount; i++) {
          vPosis[i * 3] = (Math.random() - 0.5) * 0.12;
          vPosis[i * 3 + 1] = Math.random() * 0.7;
          vPosis[i * 3 + 2] = (Math.random() - 0.5) * 0.12;
        }
        vGeom.setAttribute("position", new THREE.BufferAttribute(vPosis, 3));
        const vMat = new THREE.PointsMaterial({
          map: flameTexture,
          size: 0.18,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
        });
        const flameParticles = new THREE.Points(vGeom, vMat);
        group.add(flameParticles);
        visual.flameParticles = flameParticles;
        visual.flamePosis = vPosis;

        const volcLight = new THREE.PointLight(0xef4444, 1.8, 2.2);
        volcLight.position.set(0, 0.15, 0);
        group.add(volcLight);
        visual.light = volcLight;
      } else if (ev.type === "flood") {
        // 🌊 Flood: Shimmering inundated water surface + concentric expanding water ripples
        const rippleGeom = new THREE.PlaneGeometry(0.7, 0.7);
        const rippleMat = new THREE.MeshBasicMaterial({
          map: rippleTexture,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
        });
        const rippleMesh = new THREE.Mesh(rippleGeom, rippleMat);
        rippleMesh.rotation.x = Math.PI / 2;
        group.add(rippleMesh);
        visual.rippleMesh = rippleMesh;
      } else if (ev.type === "solar_storm") {
        // ⚡ Polar Aurora: Glowing undulating auroral curtain ribbons
        const ribbonGeom = new THREE.CylinderGeometry(0.35, 0.35, 0.45, 24, 1, true);
        const ribbonMat = new THREE.MeshBasicMaterial({
          color: 0x10b981,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.65,
          blending: THREE.AdditiveBlending,
        });
        const auroraRibbon = new THREE.Mesh(ribbonGeom, ribbonMat);
        auroraRibbon.position.y = 0.25;
        group.add(auroraRibbon);
        visual.auroraRibbon = auroraRibbon;
      }

      scene.add(group);
      liveEvents.push(visual);
    });

    // 11. SILKY SMOOTH 60 FPS ANIMATION LOOP
    let animId: number;
    let clockTime = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      clockTime += 0.016;

      // 1. Slow Earth & Cloud rotation
      cloudMesh.rotation.y = clockTime * 0.008;

      // 2. Silky smooth satellite position interpolation (lerp)
      currentPosRef.current.lerp(targetPosRef.current, 0.08);
      spacecraft.position.copy(currentPosRef.current);

      // Smooth satellite orientation along orbit tangent
      const targetLook = currentPosRef.current.clone().normalize();
      const tangent = new THREE.Vector3(-targetLook.z, targetLook.y * 0.3, targetLook.x).normalize();
      const lookAhead = currentPosRef.current.clone().add(tangent);
      spacecraft.lookAt(lookAhead);

      // Footprint position on surface
      const subSatPos = currentPosRef.current.clone().normalize().multiplyScalar(EARTH_RADIUS + 0.02);
      footprintMesh.position.copy(subSatPos);
      footprintMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), subSatPos.clone().normalize());

      // 3. Animate Live Disaster Events on Earth
      let acquiredTarget: string | null = null;
      const footprintKm = calculateFootprintRadiusKm(satAltKm, 30.0);

      liveEvents.forEach((ev, idx) => {
        // Pulse ground hazard circle
        const pulse = 1.0 + 0.2 * Math.sin(clockTime * 4.5 + idx);
        ev.ringMesh.scale.set(pulse, pulse, pulse);

        // Animate Wildfire / Volcano Particles
        if (ev.flameParticles && ev.flamePosis) {
          const arr = ev.flamePosis;
          const count = arr.length / 3;
          for (let i = 0; i < count; i++) {
            arr[i * 3 + 1] += 0.018; // Upward thermal velocity
            arr[i * 3] += (Math.sin(clockTime * 8 + i) * 0.003);
            if (arr[i * 3 + 1] > 0.6) {
              arr[i * 3] = (Math.random() - 0.5) * 0.15;
              arr[i * 3 + 1] = 0;
              arr[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
            }
          }
          (ev.flameParticles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        }

        if (ev.smokeParticles && ev.smokePosis) {
          const arr = ev.smokePosis;
          const count = arr.length / 3;
          for (let i = 0; i < count; i++) {
            arr[i * 3 + 1] += 0.012;
            arr[i * 3] += (Math.cos(clockTime * 5 + i) * 0.004);
            if (arr[i * 3 + 1] > 1.0) {
              arr[i * 3] = (Math.random() - 0.5) * 0.25;
              arr[i * 3 + 1] = 0.3;
              arr[i * 3 + 2] = (Math.random() - 0.5) * 0.25;
            }
          }
          (ev.smokeParticles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        }

        // Animate Flood Water Ripple Expansion
        if (ev.rippleMesh) {
          const rippleScale = 1.0 + ((clockTime * 0.8 + idx * 0.4) % 1.5);
          ev.rippleMesh.scale.set(rippleScale, rippleScale, rippleScale);
          (ev.rippleMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0.2, 1.0 - (rippleScale - 1.0) / 1.5);
        }

        // Animate Polar Aurora Wave
        if (ev.auroraRibbon) {
          const wave = Math.sin(clockTime * 3.0 + idx) * 0.08;
          ev.auroraRibbon.scale.set(1.0 + wave, 1.0 + wave * 1.5, 1.0 + wave);
        }

        // Fire / Volcano Flickering Light
        if (ev.light) {
          ev.light.intensity = 1.6 + 0.6 * Math.sin(clockTime * 14.0 + idx * 3.0);
        }

        // Proximity detection to satellite
        const dKm = haversineDistanceKm(satLat, satLon, ev.event.lat, ev.event.lon);
        if (dKm <= footprintKm) {
          acquiredTarget = ev.event.name;
          (ev.ringMesh.material as THREE.MeshBasicMaterial).color.setHex(0x22c55e);

          // Connect targeting laser beam from satellite to ground disaster site
          targetBeam.geometry.setFromPoints([spacecraft.position, ev.position]);
          (targetBeam.material as THREE.LineBasicMaterial).opacity = 0.9;
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

      // 4. Smooth Camera View Positioning
      const currentMode = viewModeRef.current;
      if (currentMode === "global") {
        // Panoramic Orbital view matching Picture 2
        const rad = 21.0;
        const theta = orbitAngleRef.current.theta;
        const phi = orbitAngleRef.current.phi;
        camera.position.set(
          rad * Math.cos(phi) * Math.sin(theta),
          rad * Math.sin(phi),
          rad * Math.cos(phi) * Math.cos(theta)
        );
        camera.lookAt(0, 0, 0);
      } else if (currentMode === "chase") {
        // TPP Chase Mode: directly behind the satellite facing forward along orbit
        const chaseOffset = spacecraft.position.clone().normalize().multiplyScalar(0.7);
        const behindOffset = tangent.clone().multiplyScalar(-2.2);
        camera.position.copy(spacecraft.position).add(behindOffset).add(chaseOffset);
        camera.lookAt(lookAhead);
      } else if (currentMode === "wing") {
        // Wing Cam
        const wingOffset = new THREE.Vector3(0, 0.45, 1.25);
        camera.position.copy(spacecraft.position).add(wingOffset);
        camera.lookAt(spacecraft.position);
      }

      coronaMesh.lookAt(camera.position);
      renderer.render(scene, camera);
    };

    animate();

    // 12. Mouse Drag & Zoom Controls
    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - mousePosRef.current.x;
      const dy = e.clientY - mousePosRef.current.y;
      mousePosRef.current = { x: e.clientX, y: e.clientY };

      orbitAngleRef.current.theta -= dx * 0.005;
      orbitAngleRef.current.phi = Math.max(
        -Math.PI * 0.45,
        Math.min(Math.PI * 0.45, orbitAngleRef.current.phi + dy * 0.005)
      );
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.fov = Math.max(20, Math.min(65, camera.fov + e.deltaY * 0.04));
      camera.updateProjectionMatrix();
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
      flameTexture.dispose();
      smokeTexture.dispose();
      rippleTexture.dispose();
    };
  }, []); // Mounts ONCE — 0 context destruction during flight!

  return (
    <div className={`relative w-full h-full overflow-hidden bg-void select-none ${className}`}>
      {/* 3D WebGL Canvas */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* ── Top-Right: Camera Mode Switcher ── */}
      <div className="absolute top-3 right-3 flex items-center gap-1 bg-void/85 backdrop-blur-md p-1 rounded-full border border-edge shadow-xl pointer-events-auto z-20">
        {(
          [
            ["global", "🌍 3D Globe (Picture 2)"],
            ["chase", "🚀 Pilot (TPP)"],
            ["wing", "🛰️ Wing Cam"],
            ["free", "🖐️ Free 3D"],
          ] as Array<[CameraViewMode, string]>
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
              viewMode === mode
                ? "bg-accent text-ink shadow-sm"
                : "text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Top-Left: Live Orbital Status ── */}
      <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2 pointer-events-none z-20">
        <span className="bg-void/85 backdrop-blur-md border border-cyan-500/40 px-3 py-1 rounded-full text-xs text-cyan-300 shadow-md flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span>🛰️ ULTRA REALISTIC 3D ORBIT</span>
        </span>
        <span
          className={`px-3 py-1 rounded-full text-xs border backdrop-blur-md shadow-md ${
            inEclipse
              ? "bg-indigo-950/85 border-indigo-500/40 text-indigo-300"
              : "bg-amber-950/60 border-amber-500/40 text-amber-300"
          }`}
        >
          {inEclipse ? "🌙 Night (Earth shadow)" : "☀️ Daytime"}
        </span>
        {comms?.in_contact && (
          <span className="bg-void/85 backdrop-blur-md border border-emerald-500/40 px-3 py-1 rounded-full text-xs text-emerald-300 shadow-md animate-pulse">
            📡 Ground contact: {comms.active_station?.split(" ")[0]}!
          </span>
        )}
        {activeEvent && activeEvent.is_pending && (
          <span className="bg-amber-950/85 border border-amber-400 px-3 py-1 rounded-full text-xs text-amber-200 shadow-md animate-pulse">
            ⚠️ CRISIS ALERT: {activeEvent.name}
          </span>
        )}
      </div>

      {/* ── Center Alert: Live Target Acquired! ── */}
      {inRangeTargetName && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="bg-emerald-950/90 border border-emerald-400 px-5 py-2.5 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2.5 animate-bounce">
            <span className="text-base">📸</span>
            <span className="text-xs sm:text-sm font-bold text-emerald-200">
              TARGET OVERHEAD: {inRangeTargetName} — Ready to photograph!
            </span>
          </div>
        </div>
      )}

      {/* ── Bottom-Left: Live Earth Events HUD Card ── */}
      <div className="absolute bottom-20 left-4 z-20 pointer-events-none hidden sm:block max-w-xs">
        <div className="bg-void/85 backdrop-blur-md border border-edge/80 rounded-2xl p-3 text-xs space-y-1.5 shadow-xl">
          <div className="flex items-center justify-between border-b border-edge/60 pb-1.5">
            <span className="font-bold text-ink uppercase tracking-wider text-[10px] text-faint">
              Live Earth Events
            </span>
            <span className="text-[10px] text-accent font-semibold">
              {GLOBAL_EARTH_EVENTS.length} Active Worldwide
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
