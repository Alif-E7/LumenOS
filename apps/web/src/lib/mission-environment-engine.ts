import * as THREE from "three";

// ============================================================================
// 1. WILDFIRE SCOUT — CUSTOM GLSL TERRAIN FIRE-SPREAD & PYROCUMULUS SHADERS
// ============================================================================

export const wildfireTerrainVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const wildfireTerrainFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uProgression;   // 0.25 -> 1.0 expanding fire perimeter
  uniform float uScanActive;    // 0.0 = natural view, 1.0 = SWIR thermal hotspot highlight
  uniform float uContained;     // 1.0 when contained
  uniform vec2 uWindDir;        // Normalized 2D wind direction on tangent plane
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.05 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 centered = (vUv - 0.5) * 2.0;
    // Wind-stretched elliptical fire propagation footprint
    float windStretch = dot(centered, uWindDir);
    vec2 warped = centered - uWindDir * (windStretch * 0.28);
    float dist = length(warped);

    float terrainNoise = fbm(centered * 4.5 + uWindDir * (uTime * 0.12));
    float flameFlicker = fbm(centered * 11.0 - vec2(0.0, uTime * 2.8));

    float effectiveRadius = clamp(uProgression, 0.32, 0.86) * (0.68 + 0.34 * terrainNoise);
    float outerEdge = smoothstep(effectiveRadius + 0.06, effectiveRadius - 0.02, dist);
    float innerBurned = smoothstep(effectiveRadius - 0.05, effectiveRadius - 0.22, dist);
    float fireFrontBand = clamp(outerEdge - innerBurned, 0.0, 1.0);

    // 1. Unburned forest edge, 2. Charred burn scar interior, 3. Active multi-temperature fire front
    vec3 forestColor = vec3(0.08, 0.20, 0.10);
    vec3 burnedScarColor = vec3(0.07, 0.06, 0.06);

    // Glowing smoldering coal veins inside the burned scar
    float smolder = smoothstep(0.62, 0.85, fbm(centered * 9.0 + uTime * 0.4)) * innerBurned;
    burnedScarColor += vec3(0.75, 0.18, 0.02) * smolder * (1.0 - uContained * 0.85);

    // Active flaming front: deep red -> bright orange -> incandescent yellow-white core
    float flameIntensity = fireFrontBand * (0.7 + 0.55 * flameFlicker) * (1.0 - uContained * 0.82);
    vec3 flameColor = mix(
      vec3(0.88, 0.18, 0.02),
       mix(vec3(1.0, 0.52, 0.04), vec3(1.0, 0.94, 0.65), smoothstep(0.45, 0.9, flameIntensity)),
      smoothstep(0.15, 0.75, flameIntensity)
    );

    // SWIR Satellite Thermal Detection Mode: false-color magenta/cyan perimeter & hotspot lock
    if (uScanActive > 0.01) {
      float perimeterLine = smoothstep(0.04, 0.0, abs(dist - effectiveRadius));
      flameColor = mix(flameColor, vec3(0.15, 0.95, 0.88), perimeterLine * uScanActive * 0.75);
    }

    vec3 finalColor = mix(forestColor, burnedScarColor, innerBurned);
    finalColor = mix(finalColor, flameColor, clamp(flameIntensity * 1.35, 0.0, 1.0));

    float alpha = outerEdge * (0.82 - uContained * 0.45);
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// ============================================================================
// 2. FLOOD SCOUT — TOPOGRAPHIC RIVER BASIN INUNDATION & SAR WATER SHADER
// ============================================================================

export const floodBasinFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uWaterLevel;    // 0.3 -> 0.92 rising flood stage
  uniform float uScanActive;    // 1.0 = SAR Radar Backscatter Inundation Highlight
  uniform float uContained;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(3.1, 5.7);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float radialMask = smoothstep(0.98, 0.45, length(p));
    if (radialMask <= 0.01) discard;

    // Branching river valley & delta topography usingridged multifractal valley channels
    float meander = sin(p.x * 4.2 + fbm(p * 3.0) * 2.2) * 0.22;
    float mainChannelDist = abs(p.y - meander);
    float tributaryDist = abs(p.x * 0.7 - p.y * 0.6 + 0.15 * sin(p.y * 6.0));
    float valleyElevation = min(mainChannelDist * 1.35, tributaryDist * 1.8) + fbm(p * 5.5) * 0.32;

    float floodThreshold = mix(0.28, 0.68, clamp(uWaterLevel, 0.0, 1.0)) * (1.0 - uContained * 0.35);
    float waterDepth = clamp((floodThreshold - valleyElevation) / max(0.01, floodThreshold), 0.0, 1.0);

    if (waterDepth <= 0.01) discard;

    // Animated current ripples & Fresnel specular sheen
    float wave1 = noise(p * 18.0 + vec2(uTime * 1.4, uTime * 0.6));
    float wave2 = noise(p * 32.0 - vec2(uTime * 0.9, uTime * 1.2));
    float specular = pow(clamp(wave1 * 0.55 + wave2 * 0.45, 0.0, 1.0), 4.0);

    // Transition: shallow sediment-laden overbank water -> deep river channel -> shoreline foam
    vec3 shallowMuddyWater = vec3(0.16, 0.38, 0.44);
    vec3 deepChannelWater = vec3(0.03, 0.15, 0.28);
    vec3 waterColor = mix(shallowMuddyWater, deepChannelWater, smoothstep(0.15, 0.75, waterDepth));

    // Shoreline foam & rising water-level contour
    float shorelineFoam = smoothstep(0.14, 0.02, waterDepth) * (0.5 + 0.5 * wave1);
    waterColor += vec3(0.55, 0.75, 0.85) * shorelineFoam * 0.42;
    waterColor += vec3(0.45, 0.78, 0.98) * specular * 0.65;

    // SAR Satellite Radar Backscatter Mode: high-contrast cyan inundation contour & agricultural grid
    if (uScanActive > 0.01) {
      float sarContour = smoothstep(0.06, 0.0, abs(waterDepth - 0.18));
      waterColor = mix(waterColor, vec3(0.0, 0.95, 1.0), sarContour * uScanActive * 0.85);
    }

    float alpha = radialMask * smoothstep(0.0, 0.12, waterDepth) * 0.86;
    gl_FragColor = vec4(waterColor, alpha);
  }
`;

// ============================================================================
// 3. VOLCANO WATCH — 3D STRATOVOLCANO RELIEF CONE & COOLING LAVA FLOW SHADER
// ============================================================================

export const volcanoConeVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying float vElevation;
  void main() {
    vUv = uv;
    vec2 centered = (uv - 0.5) * 2.0;
    float r = length(centered);
    // Conical stratovolcano profile with a sunken summit caldera crater at r < 0.16
    float slope = smoothstep(0.95, 0.14, r);
    float craterRim = smoothstep(0.04, 0.16, r);
    float height = slope * (0.72 + 0.28 * craterRim);
    vElevation = height;

    vec3 displaced = position + normal * (height * 0.22);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

export const volcanoConeFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uEruptionIntensity; // 0.35 -> 1.0
  uniform float uScanActive;
  uniform float uContained;
  varying vec2 vUv;
  varying float vElevation;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 0.96) discard;

    float angle = atan(p.y, p.x);
    // 5 dendritic lava channels winding down the volcanic gullies
    float gully = sin(angle * 5.0 + r * 7.0 + noise(p * 6.0) * 1.8);
    float channelMask = smoothstep(0.58, 0.92, gully);

    float maxLavaReach = mix(0.28, 0.82, uEruptionIntensity) * (1.0 - uContained * 0.55);
    float inLavaStream = channelMask * smoothstep(maxLavaReach, 0.12, r);
    float inCrater = smoothstep(0.17, 0.06, r);

    // Dark basaltic volcanic rock slope
    vec3 basaltRock = vec3(0.11, 0.09, 0.09) * (0.6 + 0.5 * vElevation);

    // Lava temperature gradient: white-yellow at summit crater -> molten orange -> cooling dark crust down-slope
    float flowPulse = noise(vec2(r * 10.0 - uTime * 1.1, angle * 3.0));
    float lavaTemp = clamp(inCrater * 1.2 + inLavaStream * (1.0 - r / max(0.2, maxLavaReach)) * (0.75 + 0.35 * flowPulse), 0.0, 1.0);
    lavaTemp *= (1.0 - uContained * 0.72);

    vec3 coolingCrust = vec3(0.22, 0.05, 0.02);
    vec3 moltenOrange = vec3(0.98, 0.32, 0.02);
    vec3 whiteHotMagma = vec3(1.0, 0.92, 0.55);

    vec3 lavaColor = mix(
      coolingCrust,
      mix(moltenOrange, whiteHotMagma, smoothstep(0.55, 0.95, lavaTemp)),
      smoothstep(0.1, 0.6, lavaTemp)
    );

    vec3 finalColor = mix(basaltRock, lavaColor, smoothstep(0.08, 0.35, lavaTemp));

    // Satellite InSAR Ground Deformation Interferometry Fringes when scanned
    if (uScanActive > 0.01) {
      float insarFringe = 0.5 + 0.5 * sin(r * 38.0 - uTime * 3.0);
      finalColor = mix(finalColor, vec3(0.1, 0.9, 1.0), insarFringe * uScanActive * 0.28);
    }

    float edgeAlpha = smoothstep(0.96, 0.65, r);
    gl_FragColor = vec4(finalColor, edgeAlpha * 0.92);
  }
`;

// ============================================================================
// 4. SOLAR STORM — CME MAGNETIZED PLASMA CLOUD & POLAR AURORA CURTAIN SHADERS
// ============================================================================

export const auroraCurtainVertexShader = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Undulating geomagnetic curtain waves along the polar oval
    float wave = sin(uv.x * 18.84955 + uTime * 1.8) * 0.06 + cos(uv.x * 37.6991 + uTime * 2.7) * 0.03;
    vec3 displaced = position + normal * (wave * uv.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

export const auroraCurtainFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uStormIntensity; // 0.4 -> 1.0 (intensifies when CME hits magnetosphere)
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    // Vertical ionospheric ray striations (atomic oxygen 557.7 nm green at base -> 630 nm violet/crimson at top)
    float rayStriation = noise(vec2(vUv.x * 42.0 + sin(uTime * 0.7), uTime * 1.4));
    float rayFine = noise(vec2(vUv.x * 85.0 - uTime * 1.1, vUv.y * 3.0));
    float curtainIntensity = pow(clamp(rayStriation * 0.65 + rayFine * 0.35, 0.0, 1.0), 1.6);

    float verticalEnvelope = smoothstep(0.0, 0.22, vUv.y) * smoothstep(1.0, 0.18, vUv.y);
    vec3 lowerOxygenGreen = vec3(0.06, 0.92, 0.52);
    vec3 midTeal = vec3(0.12, 0.82, 0.88);
    vec3 upperNitrogenViolet = vec3(0.68, 0.24, 0.96);

    vec3 auroraColor = mix(
      lowerOxygenGreen,
      mix(midTeal, upperNitrogenViolet, smoothstep(0.35, 0.85, vUv.y)),
      smoothstep(0.12, 0.75, vUv.y)
    );

    float alpha = verticalEnvelope * curtainIntensity * (0.45 + 0.45 * uStormIntensity);
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(auroraColor, alpha);
  }
`;

export const cmePlasmaVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

export const cmePlasmaFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    // Physically inspired magnetized solar plasma cloud (soft filamentary Fresnel shell, NOT a fireball)
    float ndotv = abs(dot(normalize(vNormal), normalize(vViewDir)));
    float fresnelRim = pow(1.0 - ndotv, 1.6) * 0.7 + pow(ndotv, 1.4) * 0.35;
    float filament = noise(vUv * 12.0 + vec2(uTime * 0.5, -uTime * 0.3)) * 0.65
                   + noise(vUv * 24.0 - vec2(uTime * 0.8, uTime * 0.4)) * 0.35;

    vec3 outerCoronaGold = vec3(0.98, 0.62, 0.18);
    vec3 innerMagnetizedViolet = vec3(0.55, 0.78, 1.0);
    vec3 plasmaColor = mix(outerCoronaGold, innerMagnetizedViolet, smoothstep(0.35, 0.85, filament));

    float alpha = fresnelRim * smoothstep(0.25, 0.85, filament) * uOpacity;
    if (alpha < 0.015) discard;
    gl_FragColor = vec4(plasmaColor, alpha);
  }
`;

// ============================================================================
// GLOBAL SOLAR STORM SPACE-WEATHER SYSTEM (CME + MAGNETOSPHERE + SOLAR ARCHES)
// ============================================================================

export interface SolarStormSpaceWeatherSystem {
  group: THREE.Group;
  cmeCloudGroup: THREE.Group;
  magnetosphereGroup: THREE.Group;
  bowShockMesh: THREE.Mesh;
  solarFlareArches: THREE.Group;
  update: (clockTime: number, isSolarStormMission: boolean, scanActive: boolean) => {
    cmePhase: number;
    magnetosphereCompression: number;
  };
}

/**
 * Create the full 3D Space-Weather Simulation System connecting the Sun, Interplanetary Space,
 * and Earth's Dipolar Magnetosphere.
 */
export function createSolarStormSpaceWeatherSystem(
  sunPos: THREE.Vector3,
  earthRadius: number
): SolarStormSpaceWeatherSystem {
  const group = new THREE.Group();
  group.name = "solarStormSpaceWeatherSystem";

  const sunDir = sunPos.clone().normalize();

  // 1. Erupting Solar Flare Magnetic Loop Arches on the Sun's Earth-facing hemisphere
  const solarFlareArches = new THREE.Group();
  solarFlareArches.position.copy(sunPos);
  solarFlareArches.lookAt(0, 0, 0);

  const archMat = new THREE.MeshBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  for (let i = 0; i < 4; i++) {
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(0.55 + i * 0.14, 0.035, 12, 36, Math.PI),
      archMat
    );
    arch.position.set((i - 1.5) * 0.4, (i % 2 === 0 ? 1 : -1) * 0.25, 1.85);
    arch.rotation.z = i * 0.7;
    solarFlareArches.add(arch);
  }
  group.add(solarFlareArches);

  // 2. Propagating Coronal Mass Ejection (CME) Magnetized Plasma Flux-Rope Cloud
  const cmeCloudGroup = new THREE.Group();
  const cmeMat = new THREE.ShaderMaterial({
    vertexShader: cmePlasmaVertexShader,
    fragmentShader: cmePlasmaFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.42 },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // Crescent-shaped heliospheric flux-rope shell
  const cmeShellGeom = new THREE.SphereGeometry(2.2, 36, 28, 0, Math.PI * 1.15, Math.PI * 0.18, Math.PI * 0.64);
  const cmeShell = new THREE.Mesh(cmeShellGeom, cmeMat);
  cmeShell.scale.set(1.35, 0.85, 0.65);
  cmeCloudGroup.add(cmeShell);

  const cmeInnerCore = new THREE.Mesh(
    new THREE.SphereGeometry(1.65, 28, 20, 0, Math.PI * 1.05, Math.PI * 0.22, Math.PI * 0.56),
    cmeMat
  );
  cmeInnerCore.scale.set(1.15, 0.72, 0.5);
  cmeCloudGroup.add(cmeInnerCore);
  group.add(cmeCloudGroup);

  // 3. Earth's 3D Dipolar Magnetosphere Field Lines & Dayside Magnetopause Bow Shock
  const magnetosphereGroup = new THREE.Group();
  const fieldLineMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.26,
    blending: THREE.AdditiveBlending,
  });

  const numFieldLines = 12;
  for (let i = 0; i < numFieldLines; i++) {
    const az = (i / numFieldLines) * Math.PI * 2;
    const pts: THREE.Vector3[] = [];
    // Compress dayside lines facing the Sun, stretch nightside lines into the magnetotail
    const dirVec = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const sunAlignment = dirVec.dot(sunDir);
    const L = earthRadius * (sunAlignment > 0 ? 1.55 - sunAlignment * 0.22 : 1.75 - sunAlignment * 0.55);

    for (let s = -28; s <= 28; s++) {
      const lat = (s / 28) * (Math.PI * 0.42);
      const r = L * Math.cos(lat) * Math.cos(lat);
      if (r < earthRadius * 0.96) continue;
      const x = r * Math.cos(lat) * Math.cos(az);
      const y = r * Math.sin(lat);
      const z = r * Math.cos(lat) * Math.sin(az);
      pts.push(new THREE.Vector3(x, y, z));
    }
    if (pts.length > 2) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), fieldLineMat);
      magnetosphereGroup.add(line);
    }
  }

  // Dayside Magnetopause Bow-Shock Shield facing the Sun
  const bowShockGeom = new THREE.SphereGeometry(
    earthRadius * 1.52,
    36,
    28,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.42
  );
  const bowShockMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    wireframe: true,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const bowShockMesh = new THREE.Mesh(bowShockGeom, bowShockMat);
  bowShockMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sunDir);
  magnetosphereGroup.add(bowShockMesh);
  group.add(magnetosphereGroup);

  const update = (clockTime: number, isSolarStormMission: boolean, scanActive: boolean) => {
    cmeMat.uniforms.uTime.value = clockTime;

    // CME wave propagates from Sun (t=0) to Earth's magnetosphere (t=1) on an 18-second cycle
    const cycle = (clockTime * 0.065) % 1.0;
    const startPos = sunPos.clone().multiplyScalar(0.82);
    const endPos = sunDir.clone().multiplyScalar(earthRadius * 1.35);
    cmeCloudGroup.position.lerpVectors(startPos, endPos, cycle);
    cmeCloudGroup.lookAt(0, 0, 0);

    // CME expands naturally in angular width as it travels through heliospheric space
    const expansion = 0.45 + cycle * 1.55;
    cmeCloudGroup.scale.setScalar(expansion);

    const visibilityBoost = isSolarStormMission ? 1.0 : 0.28;
    const fadeNearEnds = Math.sin(cycle * Math.PI);
    cmeMat.uniforms.uOpacity.value = (0.18 + 0.32 * fadeNearEnds) * visibilityBoost;

    // Magnetosphere compression & shimmer peak when the CME wave reaches Earth (cycle > 0.72)
    const impactFactor = cycle > 0.68 ? Math.sin(((cycle - 0.68) / 0.32) * Math.PI) : 0.0;
    const compScale = 1.0 - impactFactor * 0.09;
    magnetosphereGroup.scale.set(compScale, 1.0, compScale);

    fieldLineMat.opacity = (isSolarStormMission ? 0.24 : 0.06) + impactFactor * 0.28 + (scanActive ? 0.15 : 0);
    bowShockMat.opacity = (isSolarStormMission ? 0.1 : 0.02) + impactFactor * 0.26;
    bowShockMat.color.setHex(impactFactor > 0.4 ? 0xa855f7 : 0x38bdf8);

    // Solar flare loop arches pulse on the Sun
    const archScale = 1.0 + 0.12 * Math.sin(clockTime * 3.2);
    solarFlareArches.scale.setScalar(archScale);

    return {
      cmePhase: cycle,
      magnetosphereCompression: impactFactor,
    };
  };

  return {
    group,
    cmeCloudGroup,
    magnetosphereGroup,
    bowShockMesh,
    solarFlareArches,
    update,
  };
}
