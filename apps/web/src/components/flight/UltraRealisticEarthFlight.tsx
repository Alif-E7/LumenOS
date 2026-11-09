import { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import type { OrbitalTelemetry, CommsTelemetry, ClockState, ActiveEvent } from "../../types";
import {
  GROUND_STATIONS,
  SCENARIO_TARGETS,
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

/** Convert latitude (-90..+90) and longitude (-180..+180) to Three.js Cartesian coordinates. */
function latLonToVector3(latDeg: number, lonDeg: number, radius: number): THREE.Vector3 {
  const phi = (latDeg * Math.PI) / 180;
  const theta = ((lonDeg + 180) * Math.PI) / 180;
  const x = -radius * Math.cos(phi) * Math.cos(theta);
  const y = radius * Math.sin(phi);
  const z = radius * Math.cos(phi) * Math.sin(theta);
  return new THREE.Vector3(x, y, z);
}

/** Create procedural Earth texture with detailed continents, oceans, and night city lights. */
function createEarthCanvasTexture(): THREE.CanvasTexture {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // 1. Deep Ocean Base with subtle depth gradient
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, height);
  oceanGrad.addColorStop(0, "#081726");
  oceanGrad.addColorStop(0.3, "#0f2d4a");
  oceanGrad.addColorStop(0.5, "#143a5d");
  oceanGrad.addColorStop(0.7, "#0f2d4a");
  oceanGrad.addColorStop(1, "#081726");
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, width, height);

  // Helper to map lon/lat to canvas x/y
  const toX = (lon: number) => ((lon + 180) / 360) * width;
  const toY = (lat: number) => ((90 - lat) / 180) * height;

  // Draw landmass polygon with biomes
  function drawLandmass(
    coords: Array<[number, number]>,
    baseColor: string,
    desertRegion?: { center: [number, number]; radius: number }
  ) {
    if (!ctx || coords.length === 0) return;

    // Shallow continental shelf / turquoise coast
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

    // Desert or vegetation shading
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

  // Draw realistic continental shapes
  // North America
  drawLandmass(
    [
      [70, -165], [72, -130], [60, -85], [52, -55], [44, -64], [30, -81],
      [25, -80], [18, -95], [15, -92], [9, -78], [14, -87], [22, -105],
      [32, -117], [38, -123], [48, -125], [58, -136], [60, -148], [65, -168],
    ],
    "#2e5631",
    { center: [34, -112], radius: 16 }
  );

  // South America
  drawLandmass(
    [
      [12, -72], [10, -62], [4, -51], [-3, -38], [-12, -37], [-23, -42],
      [-34, -53], [-42, -64], [-54, -67], [-52, -74], [-38, -73], [-24, -70],
      [-12, -77], [-4, -81], [5, -77],
    ],
    "#224a26",
    { center: [-23, -68], radius: 10 }
  );

  // Eurasia (Europe + Asia)
  drawLandmass(
    [
      [71, 28], [68, 44], [72, 70], [77, 105], [70, 140], [66, 170],
      [60, 162], [52, 141], [40, 128], [32, 121], [22, 114], [21, 107],
      [10, 105], [8, 98], [22, 89], [22, 70], [25, 62], [14, 53],
      [12, 44], [30, 32], [36, 36], [42, 28], [36, -5], [43, -9],
      [48, -4], [54, 8], [58, 6], [62, 5], [70, 20],
    ],
    "#345b36",
    { center: [28, 48], radius: 24 } // Middle East & Gobi
  );

  // Africa
  drawLandmass(
    [
      [36, 10], [32, 32], [28, 34], [12, 51], [2, 45], [-11, 40],
      [-26, 33], [-34, 26], [-34, 18], [-22, 14], [-6, 12], [4, 9],
      [5, 1], [4, -7], [12, -16], [21, -17], [30, -10], [36, -5],
    ],
    "#3a5830",
    { center: [22, 18], radius: 22 } // Sahara
  );

  // Australia
  drawLandmass(
    [
      [-12, 131], [-12, 136], [-17, 141], [-11, 142], [-22, 150], [-32, 153],
      [-38, 147], [-38, 140], [-32, 132], [-35, 118], [-32, 115], [-22, 114],
      [-15, 124],
    ],
    "#8a5d3b",
    { center: [-25, 134], radius: 18 } // Outback red desert
  );

  // Greenland & Arctic Ice
  drawLandmass(
    [[76, -68], [83, -30], [81, -18], [65, -40], [60, -45], [70, -55]],
    "#e2e8f0"
  );
  // Antarctica ice shelf
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(0, toY(-65), width, height - toY(-65));

  // 3. Golden Night City Lights
  ctx.fillStyle = "rgba(253, 224, 71, 0.85)";
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

  // Draw natural wispy swirling cloud banks
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

/**
 * Procedural 3D Spacecraft Model (Lumen-1).
 * Features metallic bus, gold-foil MLI blanket, blue solar wings, dish antenna, and ion thruster.
 */
function createSpacecraftModel(): THREE.Group {
  const ship = new THREE.Group();

  // 1. Central bus (cuboid)
  const busMat = new THREE.MeshStandardMaterial({
    color: 0xcfd8dc,
    metalness: 0.85,
    roughness: 0.25,
  });
  const busGeom = new THREE.BoxGeometry(0.5, 0.4, 0.4);
  const bus = new THREE.Mesh(busGeom, busMat);
  ship.add(bus);

  // 2. Gold MLI thermal foil blanket wrap
  const foilMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    metalness: 0.95,
    roughness: 0.35,
  });
  const foilGeom = new THREE.BoxGeometry(0.52, 0.22, 0.42);
  const foil = new THREE.Mesh(foilGeom, foilMat);
  ship.add(foil);

  // 3. Solar Panel Wings (Port & Starboard)
  const solarMat = new THREE.MeshStandardMaterial({
    color: 0x1d4ed8,
    metalness: 0.65,
    roughness: 0.2,
  });
  const wingGeom = new THREE.BoxGeometry(0.35, 0.02, 0.9);

  // Right wing
  const rightWing = new THREE.Mesh(wingGeom, solarMat);
  rightWing.position.set(0, 0, 0.7);
  ship.add(rightWing);

  // Left wing
  const leftWing = new THREE.Mesh(wingGeom, solarMat);
  leftWing.position.set(0, 0, -0.7);
  ship.add(leftWing);

  // Wing connecting struts
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

  // 4. Parabolic High-Gain Dish Antenna pointing toward Earth (-Y)
  const dishMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
  const dishGeom = new THREE.ConeGeometry(0.2, 0.08, 24, 1, true);
  const dish = new THREE.Mesh(dishGeom, dishMat);
  dish.rotation.x = Math.PI;
  dish.position.set(0, -0.28, 0);
  ship.add(dish);

  // Dish feed rod
  const feedMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });
  const feedGeom = new THREE.CylinderGeometry(0.008, 0.008, 0.14);
  const feed = new THREE.Mesh(feedGeom, feedMat);
  feed.position.set(0, -0.36, 0);
  ship.add(feed);

  // 5. Thruster Engine Nozzle (-X retrograde end)
  const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9 });
  const nozzleGeom = new THREE.CylinderGeometry(0.08, 0.04, 0.12, 16);
  const nozzle = new THREE.Mesh(nozzleGeom, nozzleMat);
  nozzle.rotation.z = Math.PI / 2;
  nozzle.position.set(-0.3, 0, 0);
  ship.add(nozzle);

  // 6. Glowing Cyan Ion Thruster Exhaust Plume
  const plumeMat = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    transparent: true,
    opacity: 0.75,
  });
  const plumeGeom = new THREE.ConeGeometry(0.09, 0.28, 16);
  const plume = new THREE.Mesh(plumeGeom, plumeMat);
  plume.rotation.z = -Math.PI / 2;
  plume.position.set(-0.48, 0, 0);
  ship.add(plume);

  ship.scale.set(0.65, 0.65, 0.65);
  return ship;
}

/**
 * Ultra-Realistic 3D Flight View (Matching the Reference Screenshot).
 *
 * Renders:
 * - 3D Earth Globe with continents, blue oceans, sunlight & night city lights.
 * - Glowing atmospheric limb halo.
 * - Rotating clouds layer.
 * - Radiant Sun in space with lens flare rays and solar corona.
 * - Deep space starfield with thousands of stars.
 * - Glowing neon-cyan elliptical orbit ring looping around the planet.
 * - 3D spacecraft orbiting Earth in Third-Person Perspective (TPP).
 * - LIVE ANIMATED DISASTER EVENTS on Earth (wildfire flames & smoke, erupting volcanoes, flooding ripples, polar auroras).
 * - Target-in-range detection with targeting beam & alert HUD.
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
  const isDraggingRef = useRef(false);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const orbitAngleRef = useRef({ theta: 0.6, phi: 0.35 });

  const satLat = orbital?.latitude_deg ?? -33.8;
  const satLon = orbital?.longitude_deg ?? 145.0;
  const satAltKm = orbital?.altitude_km ?? 550.0;
  const inEclipse = orbital?.in_eclipse ?? false;

  const relevantTargets = useMemo(() => {
    return scenarioId
      ? SCENARIO_TARGETS.filter((t) => t.scenarioId === scenarioId)
      : SCENARIO_TARGETS;
  }, [scenarioId]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    // 1. Three.js Scene, Camera & Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020408); // Deep black void of space

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(13.5, 7.5, 15.0); // Perfect orbital panoramic angle matching user picture!

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.replaceChildren(renderer.domElement);

    // 2. Starfield in Deep Space
    const starsCount = 2200;
    const starGeom = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starsCount * 3);
    const starColors = new Float32Array(starsCount * 3);

    for (let i = 0; i < starsCount; i++) {
      const radius = 90 + Math.random() * 80;
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = radius * Math.cos(phi);

      // Star color variations: crisp blue-white, warm amber, white
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

    const starMat = new THREE.PointsMaterial({
      size: 1.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
    });
    const stars = new THREE.Points(starGeom, starMat);
    scene.add(stars);

    // 3. The Brilliant Sun in Space (Upper Right)
    const sunPos = new THREE.Vector3(26, 12, 18);

    // Sun directional sunlight
    const sunLight = new THREE.DirectionalLight(0xfffbeb, 3.2);
    sunLight.position.copy(sunPos);
    scene.add(sunLight);

    // Ambient space light
    const ambientLight = new THREE.AmbientLight(0x0e1726, 0.45);
    scene.add(ambientLight);

    // Radiant Sun visual sphere & corona
    const sunGeom = new THREE.SphereGeometry(1.8, 32, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff7ed });
    const sunMesh = new THREE.Mesh(sunGeom, sunMat);
    sunMesh.position.copy(sunPos);
    scene.add(sunMesh);

    // Solar flare corona ring
    const coronaGeom = new THREE.RingGeometry(1.8, 4.2, 48);
    const coronaMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.35,
    });
    const coronaMesh = new THREE.Mesh(coronaGeom, coronaMat);
    coronaMesh.position.copy(sunPos);
    coronaMesh.lookAt(camera.position);
    scene.add(coronaMesh);

    // 4. The 3D Earth Globe
    const earthGroup = new THREE.Group();
    scene.add(earthGroup);

    const earthTexture = createEarthCanvasTexture();
    const earthGeom = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);
    const earthMat = new THREE.MeshStandardMaterial({
      map: earthTexture,
      roughness: 0.55,
      metalness: 0.1,
    });
    const earthMesh = new THREE.Mesh(earthGeom, earthMat);
    earthGroup.add(earthMesh);

    // 5. Cloud Layer Sphere
    const cloudTexture = createCloudCanvasTexture();
    const cloudGeom = new THREE.SphereGeometry(EARTH_RADIUS + 0.05, 48, 48);
    const cloudMat = new THREE.MeshStandardMaterial({
      map: cloudTexture,
      transparent: true,
      opacity: 0.55,
      blending: THREE.NormalBlending,
      roughness: 0.9,
    });
    const cloudMesh = new THREE.Mesh(cloudGeom, cloudMat);
    earthGroup.add(cloudMesh);

    // 6. Glowing Atmospheric Limb Halo
    const atmoGeom = new THREE.SphereGeometry(EARTH_RADIUS + 0.18, 48, 48);
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
    const atmoMesh = new THREE.Mesh(atmoGeom, atmoMat);
    scene.add(atmoMesh);

    // 7. Ground Stations on Earth
    GROUND_STATIONS.forEach((gs) => {
      const gsPos = latLonToVector3(gs.latitude, gs.longitude, EARTH_RADIUS + 0.03);
      const gsGeom = new THREE.SphereGeometry(0.06, 12, 12);
      const gsMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
      const gsMesh = new THREE.Mesh(gsGeom, gsMat);
      gsMesh.position.copy(gsPos);
      scene.add(gsMesh);
    });

    // 8. Glowing Cyan Orbit Ring (Encircling Earth, matching picture 2)
    const orbitRadius = EARTH_RADIUS + 0.75;
    const orbitPts: THREE.Vector3[] = [];
    if (groundTrackPoints.length >= 8) {
      groundTrackPoints.forEach((pt) => {
        orbitPts.push(latLonToVector3(pt.latitude_deg, pt.longitude_deg, orbitRadius));
      });
    } else {
      const orbitSegments = 120;
      for (let i = 0; i <= orbitSegments; i++) {
        const a = (i / orbitSegments) * Math.PI * 2;
        // Inclined orbit plane (~52 degrees)
        const ox = Math.cos(a) * orbitRadius;
        const oy = Math.sin(a) * orbitRadius * Math.sin(Math.PI * 0.3);
        const oz = Math.sin(a) * orbitRadius * Math.cos(Math.PI * 0.3);
        orbitPts.push(new THREE.Vector3(ox, oy, oz));
      }
    }
    const orbitLineGeom = new THREE.BufferGeometry().setFromPoints(orbitPts);
    const orbitLineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 3,
      transparent: true,
      opacity: 0.88,
    });
    const orbitLine = new THREE.LineLoop(orbitLineGeom, orbitLineMat);
    scene.add(orbitLine);

    // 9. Active Crisis Event Beacon on Earth
    if (activeEvent && activeEvent.is_pending) {
      const alertPos = latLonToVector3(satLat, satLon, EARTH_RADIUS + 0.03);
      const alertGeom = new THREE.RingGeometry(0.2, 0.45, 24);
      const alertMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
      const alertMesh = new THREE.Mesh(alertGeom, alertMat);
      alertMesh.position.copy(alertPos);
      alertMesh.lookAt(0, 0, 0);
      scene.add(alertMesh);
    }

    // 10. 3D Spacecraft Model
    const spacecraft = createSpacecraftModel();
    scene.add(spacecraft);

    // Spacecraft ground footprint targeting circle
    const footprintGeom = new THREE.RingGeometry(0.5, 0.58, 32);
    const footprintMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
    });
    const footprintMesh = new THREE.Mesh(footprintGeom, footprintMat);
    scene.add(footprintMesh);

    // 9. LIVE ANIMATED DISASTER EVENTS ON EARTH
    interface LiveEventVisual {
      type: string;
      position: THREE.Vector3;
      meshGroup: THREE.Group;
      particles: THREE.Points;
      particlePosis: Float32Array;
      particleVels: Float32Array;
      ringMesh: THREE.Mesh;
      baseRadius: number;
    }

    const liveEvents: LiveEventVisual[] = [];

    relevantTargets.forEach((tgt) => {
      const pos = latLonToVector3(tgt.latitude, tgt.longitude, EARTH_RADIUS + 0.02);
      const normal = pos.clone().normalize();
      const eventGroup = new THREE.Group();
      eventGroup.position.copy(pos);
      eventGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

      // Expanding ground hazard circle
      const eventRingGeom = new THREE.RingGeometry(0.18, 0.28, 28);
      const eventColor = new THREE.Color(tgt.colorHex);
      const eventRingMat = new THREE.MeshBasicMaterial({
        color: eventColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
      });
      const ringMesh = new THREE.Mesh(eventRingGeom, eventRingMat);
      ringMesh.rotation.x = Math.PI / 2;
      eventGroup.add(ringMesh);

      // Animated Particles (Flames for fire, ash for volcano, ripples for flood, auroral rays for storm)
      const pCount = 80;
      const pGeom = new THREE.BufferGeometry();
      const pPosis = new Float32Array(pCount * 3);
      const pVels = new Float32Array(pCount * 3);

      for (let i = 0; i < pCount; i++) {
        pPosis[i * 3] = (Math.random() - 0.5) * 0.2;
        pPosis[i * 3 + 1] = Math.random() * 0.5; // Height along normal
        pPosis[i * 3 + 2] = (Math.random() - 0.5) * 0.2;

        pVels[i * 3] = (Math.random() - 0.5) * 0.01;
        pVels[i * 3 + 1] = 0.015 + Math.random() * 0.025; // Upward speed
        pVels[i * 3 + 2] = (Math.random() - 0.5) * 0.01;
      }
      pGeom.setAttribute("position", new THREE.BufferAttribute(pPosis, 3));

      const pMat = new THREE.PointsMaterial({
        color: eventColor,
        size: 0.12,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      });
      const particles = new THREE.Points(pGeom, pMat);
      eventGroup.add(particles);

      scene.add(eventGroup);

      liveEvents.push({
        type: tgt.scenarioId,
        position: pos,
        meshGroup: eventGroup,
        particles,
        particlePosis: pPosis,
        particleVels: pVels,
        ringMesh,
        baseRadius: 0.25,
      });
    });

    // Targeting Laser Beam when target acquired
    const beamGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0),
    ]);
    const beamMat = new THREE.LineBasicMaterial({
      color: 0x22c55e,
      linewidth: 3,
      transparent: true,
      opacity: 0,
    });
    const targetBeam = new THREE.Line(beamGeom, beamMat);
    scene.add(targetBeam);

    // 10. Animation & Render Loop
    let animId: number;
    let clockTime = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      clockTime += 0.016;

      // 1. Slow Earth & Cloud rotation
      cloudMesh.rotation.y = clockTime * 0.012;

      // 2. Spacecraft Position along Orbit
      const currentSatPos = latLonToVector3(satLat, satLon, orbitRadius);
      spacecraft.position.copy(currentSatPos);

      // Orient Spacecraft along velocity direction
      const forwardTarget = latLonToVector3(satLat + 2, satLon + 6, orbitRadius);
      spacecraft.lookAt(forwardTarget);

      // Footprint position on Earth surface below satellite
      const subSatPos = latLonToVector3(satLat, satLon, EARTH_RADIUS + 0.02);
      footprintMesh.position.copy(subSatPos);
      footprintMesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        subSatPos.clone().normalize()
      );

      // 3. Update Live Event Animations (Flame surges, volcanic plumes, ripples)
      let closestTarget: string | null = null;
      const footprintKm = calculateFootprintRadiusKm(satAltKm, 30.0);

      liveEvents.forEach((ev, idx) => {
        // Pulse ground danger ring
        const pulse = 1.0 + 0.25 * Math.sin(clockTime * 4.0 + idx);
        ev.ringMesh.scale.set(pulse, pulse, pulse);

        // Animate particles rising from Earth surface
        const posAttr = ev.particles.geometry.attributes.position as THREE.BufferAttribute;
        const arr = ev.particlePosis;
        const vels = ev.particleVels;
        const count = arr.length / 3;

        for (let i = 0; i < count; i++) {
          arr[i * 3] += vels[i * 3];
          arr[i * 3 + 1] += vels[i * 3 + 1];
          arr[i * 3 + 2] += vels[i * 3 + 2];

          // Reset particle if reached top of atmosphere
          if (arr[i * 3 + 1] > 0.8) {
            arr[i * 3] = (Math.random() - 0.5) * 0.2;
            arr[i * 3 + 1] = 0;
            arr[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
          }
        }
        posAttr.needsUpdate = true;

        // Check distance to spacecraft
        const tgtCoord = relevantTargets[idx];
        if (tgtCoord) {
          const dKm = haversineDistanceKm(satLat, satLon, tgtCoord.latitude, tgtCoord.longitude);
          if (dKm <= footprintKm) {
            closestTarget = tgtCoord.name;
            // Highlight target in neon green
            (ev.ringMesh.material as THREE.MeshBasicMaterial).color.setHex(0x22c55e);
            (ev.particles.material as THREE.PointsMaterial).color.setHex(0x4ade80);

            // Connect targeting laser beam
            const beamPoints = [spacecraft.position, ev.position];
            targetBeam.geometry.setFromPoints(beamPoints);
            (targetBeam.material as THREE.LineBasicMaterial).opacity = 0.85;
          } else {
            (ev.ringMesh.material as THREE.MeshBasicMaterial).color.setHex(
              parseInt(tgtCoord.colorHex.replace("#", ""), 16)
            );
            (ev.particles.material as THREE.PointsMaterial).color.setHex(
              parseInt(tgtCoord.colorHex.replace("#", ""), 16)
            );
          }
        }
      });

      if (!closestTarget) {
        (targetBeam.material as THREE.LineBasicMaterial).opacity = 0;
      }
      setInRangeTargetName(closestTarget);

      // 4. Camera Mode Logic
      if (viewMode === "global") {
        // Panoramic Orbital view matching picture 2
        const rad = 21.0;
        const theta = orbitAngleRef.current.theta;
        const phi = orbitAngleRef.current.phi;
        camera.position.set(
          rad * Math.cos(phi) * Math.sin(theta),
          rad * Math.sin(phi),
          rad * Math.cos(phi) * Math.cos(theta)
        );
        camera.lookAt(0, 0, 0); // Focus directly on the glowing Earth globe
      } else if (viewMode === "chase") {
        // TPP Chase Mode: directly behind the satellite facing forward
        const chaseOffset = spacecraft.position.clone().normalize().multiplyScalar(0.7);
        const behindOffset = forwardTarget.clone().sub(spacecraft.position).normalize().multiplyScalar(-1.8);
        camera.position.copy(spacecraft.position).add(behindOffset).add(chaseOffset);
        camera.lookAt(forwardTarget);
      } else if (viewMode === "wing") {
        // Wing Cam
        const wingOffset = new THREE.Vector3(0, 0.4, 1.2);
        camera.position.copy(spacecraft.position).add(wingOffset);
        camera.lookAt(spacecraft.position);
      }

      // Corona always faces camera
      coronaMesh.lookAt(camera.position);

      renderer.render(scene, camera);
    };

    animate();

    // 11. Mouse Drag Controls (Orbit the Earth freely)
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
    };
  }, [satLat, satLon, satAltKm, scenarioId, relevantTargets, viewMode]);

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
      </div>

      {/* ── Center Alert: Live Target Acquired! ── */}
      {inRangeTargetName && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="bg-emerald-950/90 border border-emerald-400 px-5 py-2 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2.5 animate-bounce">
            <span className="text-base">📸</span>
            <span className="text-xs sm:text-sm font-bold text-emerald-200">
              TARGET OVERHEAD: {inRangeTargetName} — Ready to photograph!
            </span>
          </div>
        </div>
      )}

      {/* ── Bottom Earth Event Legend ── */}
      <div className="absolute bottom-20 left-4 z-20 pointer-events-none hidden sm:block">
        <div className="bg-void/80 backdrop-blur-md border border-edge/60 rounded-xl p-2.5 text-[11px] space-y-1 shadow-lg">
          <div className="font-bold text-ink uppercase tracking-wider text-[10px] text-faint mb-1">
            Active Earth Events
          </div>
          {relevantTargets.map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full animate-pulse"
                style={{ backgroundColor: t.colorHex }}
              />
              <span className="text-muted font-medium">{t.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
