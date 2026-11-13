/**
 * PhotorealisticEarth.tsx
 *
 * Cinematic, geographically accurate, interactive 3D Earth visualization built with Three.js.
 *
 * Features:
 *  - Real NASA Blue Marble satellite imagery, topographic elevation map, oceanic specular mask,
 *    night-lights imagery, and atmospheric cloud layer
 *  - Custom GLSL surface & Rayleigh atmospheric limb scattering shaders
 *  - Authoritative Natural Earth GeoJSON country boundaries rendered as crisp golden-orange
 *    luminous spherical borders
 *  - Geographically anchored country name labels (ONLY country names) with zoom-based LOD
 *    and real-time screen-space collision avoidance to prevent label overlap
 *  - Smooth damped orbital camera controls, smooth camera transitions, and exact
 *    point-in-polygon country selection
 */

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import {
  atmosphereVertexShader,
  atmosphereFragmentShader,
  earthVertexShader,
  earthFragmentShader,
} from "../../lib/earth-shaders";
import {
  parseCountryBorders,
  createBorderGeometry,
  createCountryHighlight,
  findCountryAtLatLon,
  latLonToVector3,
  vector3ToLatLon,
  type CountryFeature,
} from "../../lib/geo-borders";
import { COUNTRY_LABELS, type CountryLabel } from "../../lib/country-labels";

// ── Constants ───────────────────────────────────────────────────────────────
const EARTH_RADIUS = 5.0;
const CLOUD_RADIUS = EARTH_RADIUS * 1.0035;
const BORDER_RADIUS = EARTH_RADIUS * 1.0015;
const LABEL_RADIUS = EARTH_RADIUS * 1.006;
const ATMOSPHERE_RADIUS = EARTH_RADIUS * 1.028;

const TEXTURE_BASE = "/textures/earth";
const DATA_BASE = "/data";

// ── Deep-Space Starfield ────────────────────────────────────────────────────
function createStarfield(): THREE.Points {
  const count = 4500;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const radius = 220 + Math.random() * 320;
    const u = Math.random();
    const v = Math.random();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2.0 * v - 1.0);

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);

    // Subtle stellar temperature variation
    const b = 0.55 + Math.random() * 0.45;
    const tint = Math.random();
    if (tint > 0.82) {
      colors[i * 3] = 0.78 * b;
      colors[i * 3 + 1] = 0.88 * b;
      colors[i * 3 + 2] = 1.0 * b;
    } else if (tint > 0.65) {
      colors[i * 3] = 1.0 * b;
      colors[i * 3 + 1] = 0.93 * b;
      colors[i * 3 + 2] = 0.8 * b;
    } else {
      colors[i * 3] = b;
      colors[i * 3 + 1] = b;
      colors[i * 3 + 2] = b;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.55,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    sizeAttenuation: true,
    depthWrite: false,
  });

  return new THREE.Points(geometry, material);
}

// ── High-DPI Country Name Sprite ────────────────────────────────────────────
interface LabelNode {
  sprite: THREE.Sprite;
  name: string;
  lat: number;
  lon: number;
  importance: 1 | 2 | 3;
  localNormal: THREE.Vector3;
  baseWidth: number;
  baseHeight: number;
}

function createCountryLabelSprite(
  text: string,
  importance: 1 | 2 | 3,
): { sprite: THREE.Sprite; aspect: number } {
  const canvas = document.createElement("canvas");
  const dpr = 2;
  const fontSize = (importance === 1 ? 28 : importance === 2 ? 23 : 20) * dpr;
  const ctx = canvas.getContext("2d")!;

  const fontSpec = `500 ${fontSize}px "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.font = fontSpec;
  const measured = ctx.measureText(text);
  const padX = 18 * dpr;
  const padY = 12 * dpr;

  canvas.width = Math.ceil(measured.width + padX * 2);
  canvas.height = Math.ceil(fontSize + padY * 2);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = fontSpec;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  // Restrained dark halo for readability over bright clouds/deserts
  ctx.lineJoin = "round";
  ctx.lineWidth = 3.5 * dpr;
  ctx.strokeStyle = "rgba(4, 8, 18, 0.78)";
  ctx.strokeText(text, cx, cy);

  // Subtle warm-golden glow
  ctx.shadowColor = "rgba(235, 180, 75, 0.55)";
  ctx.shadowBlur = (importance === 1 ? 6 : 4) * dpr;

  // Warm golden / champagne typography
  ctx.fillStyle =
    importance === 1
      ? "#f6dc96"
      : importance === 2
        ? "#ecd28e"
        : "#e2ca8c";
  ctx.fillText(text, cx, cy);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 10;
  const aspect = canvas.width / canvas.height;
  return { sprite, aspect };
}

/**
 * Merge authoritative Natural Earth label centroids from GeoJSON features
 * with our curated COUNTRY_LABELS catalog so every country has accurate
 * placement and importance ranking.
 */
function buildMergedCountryLabels(
  countries: CountryFeature[],
): CountryLabel[] {
  const byLowerName = new Map<string, CountryLabel>();
  for (const item of COUNTRY_LABELS) {
    byLowerName.set(item.name.toLowerCase(), { ...item });
  }

  for (const feat of countries) {
    const key = feat.name.toLowerCase();
    const existing = byLowerName.get(key);
    const rank = feat.labelRank ?? 4;
    const derivedImportance: 1 | 2 | 3 =
      rank <= 2 ? 1 : rank <= 4 ? 2 : 3;

    if (
      typeof feat.labelLat === "number" &&
      typeof feat.labelLon === "number"
    ) {
      if (existing) {
        // Use Natural Earth representative label point for geographic precision
        existing.lat = feat.labelLat;
        existing.lon = feat.labelLon;
      } else {
        byLowerName.set(key, {
          name: feat.name,
          lat: feat.labelLat,
          lon: feat.labelLon,
          importance: derivedImportance,
        });
      }
    }
  }

  return Array.from(byLowerName.values());
}

// ── Damped Spherical Orbit Controller with Smooth Transitions ───────────────
class GlobeOrbitController {
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;

  spherical = new THREE.Spherical(14.5, Math.PI * 0.38, 0.35);
  target = new THREE.Vector3(0, 0, 0);

  minDistance = 6.15;
  maxDistance = 32.0;

  private _isPointerDown = false;
  private _pointerDownPos = { x: 0, y: 0 };
  private _prevPointer = { x: 0, y: 0 };
  private _velTheta = 0;
  private _velPhi = 0;
  private _velRadius = 0;
  private _targetSpherical: { theta: number; phi: number } | null = null;
  public wasDragged = false;
  public autoRotate = true;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;

    domElement.addEventListener("pointerdown", this._onPointerDown);
    window.addEventListener("pointermove", this._onPointerMove);
    window.addEventListener("pointerup", this._onPointerUp);
    domElement.addEventListener("wheel", this._onWheel, { passive: false });
  }

  private _onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this._isPointerDown = true;
    this.wasDragged = false;
    this._targetSpherical = null;
    this.autoRotate = false;
    this._pointerDownPos = { x: e.clientX, y: e.clientY };
    this._prevPointer = { x: e.clientX, y: e.clientY };
  };

  private _onPointerMove = (e: PointerEvent) => {
    if (!this._isPointerDown) return;
    const dx = e.clientX - this._prevPointer.x;
    const dy = e.clientY - this._prevPointer.y;
    this._prevPointer = { x: e.clientX, y: e.clientY };

    const totalMoved = Math.hypot(
      e.clientX - this._pointerDownPos.x,
      e.clientY - this._pointerDownPos.y,
    );
    if (totalMoved > 5) {
      this.wasDragged = true;
    }

    // Scale rotation speed with zoom distance so close-up panning feels precise
    const zoomFactor = Math.max(
      0.22,
      (this.spherical.radius - EARTH_RADIUS) / 10.0,
    );
    const speed = 0.0032 * zoomFactor;

    this._velTheta = -dx * speed;
    this._velPhi = -dy * speed;

    this.spherical.theta += this._velTheta;
    this.spherical.phi = Math.max(
      0.12,
      Math.min(Math.PI - 0.12, this.spherical.phi + this._velPhi),
    );
  };

  private _onPointerUp = () => {
    this._isPointerDown = false;
  };

  private _onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this._targetSpherical = null;
    const zoomStep = (this.spherical.radius - EARTH_RADIUS) * 0.0011;
    this._velRadius += e.deltaY * Math.max(0.002, zoomStep);
  };

  /** Smoothly transition camera orientation toward a world-space surface point */
  focusWorldDirection(worldDir: THREE.Vector3) {
    const s = new THREE.Spherical().setFromVector3(
      worldDir.clone().normalize().multiplyScalar(this.spherical.radius),
    );
    // Shortest angular delta for theta
    let dTheta = s.theta - this.spherical.theta;
    while (dTheta > Math.PI) dTheta -= Math.PI * 2;
    while (dTheta < -Math.PI) dTheta += Math.PI * 2;

    this._targetSpherical = {
      theta: this.spherical.theta + dTheta,
      phi: Math.max(0.15, Math.min(Math.PI - 0.15, s.phi)),
    };
  }

  update() {
    if (this._targetSpherical) {
      this.spherical.theta +=
        (this._targetSpherical.theta - this.spherical.theta) * 0.08;
      this.spherical.phi +=
        (this._targetSpherical.phi - this.spherical.phi) * 0.08;
      if (
        Math.abs(this._targetSpherical.theta - this.spherical.theta) < 0.001 &&
        Math.abs(this._targetSpherical.phi - this.spherical.phi) < 0.001
      ) {
        this._targetSpherical = null;
      }
    } else if (!this._isPointerDown) {
      if (this.autoRotate) {
        this.spherical.theta += 0.00035;
      }
      this.spherical.theta += this._velTheta;
      this.spherical.phi = Math.max(
        0.12,
        Math.min(Math.PI - 0.12, this.spherical.phi + this._velPhi),
      );
      this._velTheta *= 0.91;
      this._velPhi *= 0.91;
    }

    this.spherical.radius = Math.max(
      this.minDistance,
      Math.min(this.maxDistance, this.spherical.radius + this._velRadius),
    );
    this._velRadius *= 0.84;

    const pos = new THREE.Vector3().setFromSpherical(this.spherical);
    this.camera.position.copy(pos.add(this.target));
    this.camera.lookAt(this.target);
  }

  dispose() {
    this.domElement.removeEventListener("pointerdown", this._onPointerDown);
    window.removeEventListener("pointermove", this._onPointerMove);
    window.removeEventListener("pointerup", this._onPointerUp);
    this.domElement.removeEventListener("wheel", this._onWheel);
  }
}

// ── Main Component ──────────────────────────────────────────────────────────
export interface PhotorealisticEarthProps {
  className?: string;
}

export function PhotorealisticEarth({
  className = "",
}: PhotorealisticEarthProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const handleCountrySelect = useCallback((name: string | null) => {
    setSelectedCountry(name);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animFrameId = 0;
    let disposed = false;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // ── Renderer ──
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      container.replaceChildren(renderer.domElement);
    } catch (err) {
      console.warn("Globe WebGLRenderer initialization skipped or unsupported in environment:", err);
      return;
    }

    // ── Scene & Camera ──
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010307);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    const controls = new GlobeOrbitController(camera, renderer.domElement);

    // ── Solar Illumination ──
    const sunDir = new THREE.Vector3(1.0, 0.28, 0.85).normalize();
    const sunLight = new THREE.DirectionalLight(0xfff9ed, 2.4);
    sunLight.position.copy(sunDir.clone().multiplyScalar(60));
    scene.add(sunLight);

    const ambientLight = new THREE.AmbientLight(0x162238, 0.35);
    scene.add(ambientLight);

    // ── Deep-Space Starfield ──
    const starfield = createStarfield();
    scene.add(starfield);

    // ── Earth Group ──
    const earthGroup = new THREE.Group();
    // Initial rotation showing Europe, Africa, Middle East & South Asia clearly
    earthGroup.rotation.y = -0.55;
    scene.add(earthGroup);

    // ── Texture Loader ──
    const loader = new THREE.TextureLoader();
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    const loadTex = (
      path: string,
      isSRGB = true,
    ): Promise<THREE.Texture | null> =>
      new Promise((resolve) => {
        loader.load(
          path,
          (tex) => {
            tex.colorSpace = isSRGB
              ? THREE.SRGBColorSpace
              : THREE.LinearSRGBColorSpace;
            tex.anisotropy = maxAnisotropy;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            resolve(tex);
          },
          undefined,
          () => resolve(null),
        );
      });

    let cleanupClick: (() => void) | undefined;

    const initGlobe = async () => {
      const [dayTex, nightTex, bumpTex, specTex, cloudTex] = await Promise.all([
        loadTex(`${TEXTURE_BASE}/earth-blue-marble.jpg`, true),
        loadTex(`${TEXTURE_BASE}/earth-night.jpg`, true),
        loadTex(`${TEXTURE_BASE}/earth-topology.png`, false),
        loadTex(`${TEXTURE_BASE}/earth-water.png`, false),
        loadTex(`${TEXTURE_BASE}/earth-clouds.png`, true),
      ]);

      if (disposed) return;

      // 1×1 fallback textures if any optional texture is missing
      const emptyBlack = new THREE.DataTexture(
        new Uint8Array([0, 0, 0, 255]),
        1,
        1,
      );
      emptyBlack.needsUpdate = true;

      // ── 1. Earth Surface Sphere ──
      const earthGeom = new THREE.SphereGeometry(EARTH_RADIUS, 160, 80);
      const earthMat = dayTex
        ? new THREE.ShaderMaterial({
            vertexShader: earthVertexShader,
            fragmentShader: earthFragmentShader,
            uniforms: {
              dayTexture: { value: dayTex },
              nightTexture: { value: nightTex ?? emptyBlack },
              bumpTexture: { value: bumpTex ?? emptyBlack },
              specularTexture: { value: specTex ?? emptyBlack },
              sunDirection: { value: sunDir },
              bumpScale: { value: bumpTex ? 0.045 : 0.0 },
              ambientStrength: { value: 0.14 },
            },
          })
        : new THREE.MeshStandardMaterial({
            color: 0x1d4e89,
            roughness: 0.75,
          });

      const earthMesh = new THREE.Mesh(earthGeom, earthMat);
      earthGroup.add(earthMesh);

      // ── 2. Subtle Cloud Layer ──
      let cloudMesh: THREE.Mesh | null = null;
      if (cloudTex) {
        const cloudGeom = new THREE.SphereGeometry(CLOUD_RADIUS, 128, 64);
        const cloudMat = new THREE.MeshLambertMaterial({
          map: cloudTex,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        cloudMesh = new THREE.Mesh(cloudGeom, cloudMat);
        earthGroup.add(cloudMesh);
      }

      // ── 3. Outer Rayleigh Atmosphere Limb Halo ──
      const atmosGeom = new THREE.SphereGeometry(ATMOSPHERE_RADIUS, 96, 48);
      const atmosMat = new THREE.ShaderMaterial({
        vertexShader: atmosphereVertexShader,
        fragmentShader: atmosphereFragmentShader,
        uniforms: {
          sunDirection: { value: sunDir },
          atmosphereColor: { value: new THREE.Color(0.32, 0.64, 1.0) },
          atmosphereStrength: { value: 1.15 },
        },
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const atmosMesh = new THREE.Mesh(atmosGeom, atmosMat);
      scene.add(atmosMesh);

      // ── 4. Real GeoJSON Country Borders ──
      let countriesData: CountryFeature[] = [];
      try {
        let res = await fetch(`${DATA_BASE}/countries.geojson`);
        if (!res.ok) {
          res = await fetch(`${DATA_BASE}/countries-110m.json`);
        }
        if (res.ok) {
          const rawGeo = await res.json();
          countriesData = parseCountryBorders(rawGeo);
          if (!disposed && countriesData.length > 0) {
            const borderLines = createBorderGeometry(
              countriesData,
              EARTH_RADIUS,
              BORDER_RADIUS - EARTH_RADIUS,
            );
            earthGroup.add(borderLines);
          }
        }
      } catch {
        // Ignore network errors in test environments
      }

      if (disposed) return;

      // ── 5. Geographically Accurate Country Labels (Country Names ONLY) ──
      const mergedLabels = buildMergedCountryLabels(countriesData);
      const labelNodes: LabelNode[] = [];

      for (const item of mergedLabels) {
        const { sprite, aspect } = createCountryLabelSprite(
          item.name,
          item.importance,
        );
        const localPos = latLonToVector3(item.lat, item.lon, LABEL_RADIUS);
        sprite.position.copy(localPos);

        const baseHeight =
          item.importance === 1 ? 0.24 : item.importance === 2 ? 0.19 : 0.15;
        const baseWidth = baseHeight * aspect;
        sprite.scale.set(baseWidth, baseHeight, 1);

        earthGroup.add(sprite);
        labelNodes.push({
          sprite,
          name: item.name,
          lat: item.lat,
          lon: item.lon,
          importance: item.importance,
          localNormal: localPos.clone().normalize(),
          baseWidth,
          baseHeight,
        });
      }

      // Sort by importance tier first so major countries always win overlap checks
      labelNodes.sort((a, b) => a.importance - b.importance);

      // ── 6. Country Selection via Raycasting & Exact Point-in-Polygon ──
      let highlightMesh: THREE.LineSegments | null = null;
      const raycaster = new THREE.Raycaster();
      const pointerNDC = new THREE.Vector2();

      const clearHighlight = () => {
        if (highlightMesh) {
          earthGroup.remove(highlightMesh);
          highlightMesh.geometry.dispose();
          (highlightMesh.material as THREE.Material).dispose();
          highlightMesh = null;
        }
      };

      const onCanvasClick = (e: MouseEvent) => {
        // Ignore end of drag gestures
        if (controls.wasDragged) return;

        const rect = renderer.domElement.getBoundingClientRect();
        pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(pointerNDC, camera);
        const hits = raycaster.intersectObject(earthMesh, false);

        if (hits.length === 0) {
          clearHighlight();
          handleCountrySelect(null);
          return;
        }

        const worldHit = hits[0].point.clone();
        const localHit = earthGroup.worldToLocal(worldHit.clone());
        const { lat, lon } = vector3ToLatLon(localHit);

        // 1. Exact point-in-polygon lookup in GeoJSON country boundaries
        let matchedFeature = findCountryAtLatLon(countriesData, lat, lon);
        let matchedName = matchedFeature?.name ?? null;

        // 2. Fallback for tiny island nations not in 110m polygon resolution
        if (!matchedName) {
          let bestDist = 4.5;
          for (const lbl of mergedLabels) {
            const d = Math.hypot(lat - lbl.lat, lon - lbl.lon);
            if (d < bestDist) {
              bestDist = d;
              matchedName = lbl.name;
            }
          }
          if (matchedName && countriesData.length > 0) {
            const lower = matchedName.toLowerCase();
            matchedFeature =
              countriesData.find((c) => c.name.toLowerCase() === lower) ?? null;
          }
        }

        clearHighlight();

        if (matchedFeature) {
          highlightMesh = createCountryHighlight(
            matchedFeature,
            EARTH_RADIUS,
            0.005,
          );
          earthGroup.add(highlightMesh);
        }

        if (matchedName) {
          handleCountrySelect(matchedName);
          controls.focusWorldDirection(worldHit);
        } else {
          handleCountrySelect(null);
        }
      };

      renderer.domElement.addEventListener("click", onCanvasClick);
      cleanupClick = () => {
        renderer.domElement.removeEventListener("click", onCanvasClick);
        clearHighlight();
      };

      setLoading(false);

      // ── 7. Render & LOD Loop ──
      const clock = new THREE.Clock();
      const tempWorldPos = new THREE.Vector3();
      const tempWorldNormal = new THREE.Vector3();
      const tempNDC = new THREE.Vector3();
      const earthQuat = new THREE.Quaternion();

      const animate = () => {
        if (disposed) return;
        animFrameId = requestAnimationFrame(animate);

        const elapsed = clock.getElapsedTime();
        controls.update();

        // Keep sun illumination aligned with the camera hemisphere so the viewed side
        // has cinematic satellite illumination and a visible horizon terminator
        const camDir = camera.position.clone().normalize();
        const camRight = new THREE.Vector3()
          .crossVectors(new THREE.Vector3(0, 1, 0), camDir)
          .normalize();
        sunDir
          .copy(camDir)
          .multiplyScalar(0.78)
          .addScaledVector(camRight, 0.52)
          .add(new THREE.Vector3(0, 0.25, 0))
          .normalize();
        sunLight.position.copy(sunDir.clone().multiplyScalar(60));

        // Gentle differential cloud motion
        if (cloudMesh) {
          cloudMesh.rotation.y = elapsed * 0.0025;
        }

        // Dynamic zoom-based label visibility & screen-space overlap culling
        const camDist = camera.position.length();
        // Scale factor so labels get finer as the camera zooms in close to small nations
        const distScale = THREE.MathUtils.clamp(
          (camDist - EARTH_RADIUS) / 9.5,
          0.32,
          1.15,
        );

        earthGroup.getWorldQuaternion(earthQuat);
        const occupiedBoxes: Array<{
          minX: number;
          maxX: number;
          minY: number;
          maxY: number;
        }> = [];

        for (const node of labelNodes) {
          // Zoom threshold by importance tier
          const maxVisibleDist =
            node.importance === 1 ? 28.0 : node.importance === 2 ? 15.5 : 10.2;
          if (camDist > maxVisibleDist) {
            node.sprite.visible = false;
            continue;
          }

          // Horizon / hemisphere culling
          tempWorldNormal.copy(node.localNormal).applyQuaternion(earthQuat);
          node.sprite.getWorldPosition(tempWorldPos);
          const toCam = camera.position
            .clone()
            .sub(tempWorldPos)
            .normalize();
          const facingDot = tempWorldNormal.dot(toCam);

          if (facingDot <= 0.22) {
            node.sprite.visible = false;
            continue;
          }

          // Project to Normalized Device Coordinates [-1, 1] for collision check
          tempNDC.copy(tempWorldPos).project(camera);
          if (tempNDC.z > 1.0) {
            node.sprite.visible = false;
            continue;
          }

          // Estimate screen-space bounding box in NDC units
          const halfW = (node.baseWidth * distScale) / (camDist * 0.68);
          const halfH = (node.baseHeight * distScale) / (camDist * 0.65);
          const box = {
            minX: tempNDC.x - halfW,
            maxX: tempNDC.x + halfW,
            minY: tempNDC.y - halfH,
            maxY: tempNDC.y + halfH,
          };

          let overlaps = false;
          for (const placed of occupiedBoxes) {
            if (
              box.minX < placed.maxX &&
              box.maxX > placed.minX &&
              box.minY < placed.maxY &&
              box.maxY > placed.minY
            ) {
              overlaps = true;
              break;
            }
          }

          if (overlaps) {
            node.sprite.visible = false;
            continue;
          }

          occupiedBoxes.push(box);
          node.sprite.visible = true;
          node.sprite.scale.set(
            node.baseWidth * distScale,
            node.baseHeight * distScale,
            1,
          );

          // Smooth opacity fade near limb & zoom threshold
          const limbFade = THREE.MathUtils.smoothstep(facingDot, 0.22, 0.48);
          const zoomFade = THREE.MathUtils.smoothstep(
            maxVisibleDist - camDist,
            0.0,
            2.2,
          );
          const isSelected = selectedCountry === node.name;
          (node.sprite.material as THREE.SpriteMaterial).opacity = isSelected
            ? 1.0
            : limbFade * zoomFade * 0.92;
        }

        renderer.render(scene, camera);
      };

      animate();
    };

    void initGlobe();

    // ── Resize Handler ──
    const onResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(animFrameId);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      cleanupClick?.();
      renderer.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });
    };
  }, [handleCountrySelect]);

  return (
    <div
      className={`relative w-full h-full bg-[#010307] overflow-hidden select-none ${className}`}
    >
      {/* Interactive 3D WebGL Globe Canvas */}
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Minimal loading state */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#010307]/90 z-20 pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-amber-400/25 border-t-amber-400 rounded-full animate-spin" />
            <span className="text-amber-200/80 text-xs tracking-[0.2em] uppercase font-mono">
              Initializing Earth Imagery
            </span>
          </div>
        </div>
      )}

      {/* Selected Country Name Indicator (ONLY country name, zero clutter) */}
      {selectedCountry && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="bg-black/65 backdrop-blur-md border border-amber-400/40 px-5 py-2 rounded-full shadow-2xl">
            <span className="text-amber-200 text-sm font-medium tracking-wide">
              {selectedCountry}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
