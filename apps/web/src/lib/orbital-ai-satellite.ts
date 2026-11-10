import * as THREE from "three";

export interface RadiatorConfiguration {
  /** Number of deployable thermal radiator wings (2 or 4). */
  wingCount: 2 | 4;
  /** Current core thermal load in degrees Celsius (controls subtle heat-pipe thermal state). */
  thermalLoadC: number;
  /** Number of parallel cooling channels per radiator panel. */
  channelsPerPanel?: number;
}

export interface OrbitalAIDataCenterSatelliteConfig {
  id: string;
  name: string;
  role?: "primary_scout" | "flagship_datacenter" | "constellation_node";
  /** Overall uniform scale of the satellite assembly (default: 0.62). */
  scale?: number;
  /** Orbit radius in Three.js scene units (Earth radius = 5.0). */
  orbitRadius?: number;
  /** Orbit altitude in kilometers for telemetry display (default: 550). */
  orbitAltitudeKm?: number;
  /** Orbital inclination in radians (default: 0.90). */
  orbitalInclination?: number;
  /** Right Ascension of the Ascending Node in radians (default: 0.0). */
  raan?: number;
  /** Angular orbital speed in radians per frame (default: 0.0018). */
  orbitalSpeed?: number;
  /** Initial orbital anomaly phase in radians (default: 0.0). */
  initialPhase?: number;
  /** Solar panel yaw orientation in radians ("auto" tracks the Sun vector). */
  solarPanelOrientation?: "auto" | number;
  /** Deployable thermal radiator wing configuration. */
  radiatorConfig?: RadiatorConfiguration;
  /** Maximum inter-satellite optical laser link range in scene units (default: 9.5). */
  communicationRange?: number;
  /** Active connected peer satellite IDs. */
  networkConnections?: string[];
  /** Whether to start in the folded state and play the 5-stage deployment sequence (default: true). */
  autoDeployOnEnter?: boolean;
}

export interface DeploymentStageStatus {
  progress: number;
  stageIndex: 1 | 2 | 3 | 4 | 5;
  stageLabel: string;
  isDeployed: boolean;
}

/**
 * Generate a high-precision photovoltaic solar cell grid texture with deep blue-black
 * monocrystalline cells, thin silver busbars, and subtle cell-interconnect nodes.
 */
function createSolarCellGridTexture(): THREE.CanvasTexture {
  const width = 512;
  const height = 256;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Deep blue-black photovoltaic substrate
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "#050d1f");
  grad.addColorStop(0.5, "#091936");
  grad.addColorStop(1, "#061024");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  const cols = 16;
  const rows = 8;
  const cellW = width / cols;
  const cellH = height / rows;

  // Individual solar cells with chamfered corners and micro-finger gridlines
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cellW + 2;
      const y = r * cellH + 2;
      const w = cellW - 4;
      const h = cellH - 4;

      ctx.fillStyle = (r + c) % 2 === 0 ? "#0a1d3d" : "#081833";
      ctx.fillRect(x, y, w, h);

      // Subtle horizontal silver collector fingers inside each cell
      ctx.strokeStyle = "rgba(148, 163, 184, 0.22)";
      ctx.lineWidth = 1;
      for (let f = 1; f <= 3; f++) {
        const fy = y + (h * f) / 4;
        ctx.beginPath();
        ctx.moveTo(x, fy);
        ctx.lineTo(x + w, fy);
        ctx.stroke();
      }
    }
  }

  // Primary silver-titanium busbars along cell boundaries
  ctx.strokeStyle = "rgba(186, 200, 216, 0.55)";
  ctx.lineWidth = 1.5;
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath();
    ctx.moveTo(c * cellW, 0);
    ctx.lineTo(c * cellW, height);
    ctx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * cellH);
    ctx.lineTo(width, r * cellH);
    ctx.stroke();
  }

  // Silver interconnect solder pads at intersections
  ctx.fillStyle = "rgba(226, 232, 240, 0.78)";
  for (let r = 1; r < rows; r++) {
    for (let c = 1; c < cols; c++) {
      ctx.fillRect(c * cellW - 2, r * cellH - 2, 4, 4);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Generate a realistic industrial thermal radiator panel texture with parallel
 * ammonia micro-channel heat pipes, manifold headers, and silver-graphite thermal louvers.
 */
function createRadiatorChannelTexture(): THREE.CanvasTexture {
  const width = 512;
  const height = 256;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Silver-titanium & graphite thermal rejection coating
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#bfc9d4");
  bg.addColorStop(0.5, "#d4dde6");
  bg.addColorStop(1, "#b4c0cc");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Parallel longitudinal cooling channels (24 thin parallel channels)
  const channels = 24;
  const chHeight = height / channels;
  for (let i = 0; i < channels; i++) {
    const y = i * chHeight;
    ctx.fillStyle = i % 2 === 0 ? "#8f9ba8" : "#c8d2dc";
    ctx.fillRect(16, y + 2, width - 32, chHeight - 3);

    // Dark graphite micro-fin recess line
    ctx.strokeStyle = "#2b3440";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(16, y + chHeight * 0.5);
    ctx.lineTo(width - 16, y + chHeight * 0.5);
    ctx.stroke();
  }

  // Vertical structural manifold headers & copper/gold heat-transfer joints
  const ribs = 6;
  for (let r = 0; r <= ribs; r++) {
    const x = (r / ribs) * (width - 32) + 16;
    ctx.fillStyle = "#475569";
    ctx.fillRect(x - 3, 0, 6, height);
    ctx.fillStyle = "#b8860b";
    ctx.fillRect(x - 1, 6, 2, height - 12);
  }

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

/**
 * Generate an industrial spacecraft bus panel texture with titanium seams, access hatches,
 * fastener rivets, and subtle aerospace stencil markings.
 */
function createBusPanelTexture(labelText: string): THREE.CanvasTexture {
  const width = 512;
  const height = 256;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.fillStyle = "#1c232d";
  ctx.fillRect(0, 0, width, height);

  // Structural panel grid seams
  ctx.strokeStyle = "#3b4758";
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, width - 16, height - 16);

  for (let i = 1; i < 4; i++) {
    const x = (width * i) / 4;
    ctx.beginPath();
    ctx.moveTo(x, 8);
    ctx.lineTo(x, height - 8);
    ctx.stroke();
  }

  // Corner titanium screw heads
  ctx.fillStyle = "#94a3b8";
  for (let i = 0; i < 4; i++) {
    const bx = (width * i) / 4 + 16;
    const ex = (width * (i + 1)) / 4 - 16;
    [20, height - 20].forEach((by) => {
      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, Math.PI * 2);
      ctx.arc(ex, by, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Stencil telemetry nomenclature
  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 18px monospace";
  ctx.fillText(labelText, 26, 42);
  ctx.fillStyle = "#38bdf8";
  ctx.font = "13px monospace";
  ctx.fillText("ORBITAL AI COMPUTE BUS // 24-TOPS NPU CLUSTER", 26, 64);

  return new THREE.CanvasTexture(canvas);
}

let cachedSolarTex: THREE.CanvasTexture | null = null;
let cachedRadiatorTex: THREE.CanvasTexture | null = null;

function getSharedSolarTexture(): THREE.CanvasTexture {
  if (!cachedSolarTex) cachedSolarTex = createSolarCellGridTexture();
  return cachedSolarTex;
}

function getSharedRadiatorTexture(): THREE.CanvasTexture {
  if (!cachedRadiatorTex) cachedRadiatorTex = createRadiatorChannelTexture();
  return cachedRadiatorTex;
}

/**
 * Reusable, modular, aerospace-engineered Three.js Orbital AI Data Center Satellite.
 *
 * Implements:
 * - A. Central AI Compute Module (titanium/graphite structural bus, InstancedMesh server blades,
 *      InstancedMesh status LEDs, InstancedMesh structural fasteners, gold MLI thermal blankets)
 * - B. Large Deployable Thermal Radiator Wings (perpendicular to solar wings, 2-stage hinged panels,
 *      InstancedMesh parallel cooling channels, visible ammonia manifolds, scissor support trusses)
 * - C. Quad Deployable Photovoltaic Solar Power Arrays (4 multi-segment folding wings with sun-tracking
 *      rotary yokes, deep blue-black solar cell grids, silver frames, and deployment hinges)
 * - D. Communication Systems (articulated Ka/X-band parabolic dishes, 4 corner Optical Laser
 *      Communication Terminals [OISL], and phased-array navigation antennas)
 * - E. Additional Aerospace Hardware (8 InstancedMesh corner RCS thruster blocks, reaction wheel
 *      housing, dual optical star trackers with baffles, Hall-effect ion thruster + xenon propellant tanks)
 * - 5-Stage Mechanical Deployment Animation & 3-Level LOD for close-up inspection and global constellation views.
 */
export class OrbitalAIDataCenterSatellite {
  public readonly id: string;
  public readonly name: string;
  public readonly role: "primary_scout" | "flagship_datacenter" | "constellation_node";
  public readonly root: THREE.Group;
  public readonly lod: THREE.LOD;
  public readonly highDetailGroup: THREE.Group;
  public readonly mediumDetailGroup: THREE.Group;
  public readonly lowDetailGroup: THREE.Group;

  // Separate articulated sub-assemblies for independent animation & deployment
  public readonly computeModuleGroup: THREE.Group;
  public readonly solarAssemblyGroup: THREE.Group;
  public readonly radiatorAssemblyGroup: THREE.Group;
  public readonly commsAssemblyGroup: THREE.Group;
  public readonly propulsionGroup: THREE.Group;

  // Hinged sub-parts for mechanical deployment & sun tracking
  private readonly solarYokes: THREE.Group[] = [];
  private readonly solarInnerWings: THREE.Group[] = [];
  private readonly solarOuterWings: THREE.Group[] = [];
  private readonly radiatorMounts: THREE.Group[] = [];
  private readonly radiatorInnerPanels: THREE.Group[] = [];
  private readonly radiatorOuterPanels: THREE.Group[] = [];
  private readonly dishBooms: THREE.Group[] = [];
  private readonly opticalLaserHeads: THREE.Group[] = [];
  private readonly radiatorMaterials: THREE.MeshStandardMaterial[] = [];
  private statusLedInstancedMesh: THREE.InstancedMesh | null = null;

  // Configurable orbital & network state
  public scale: number;
  public orbitRadius: number;
  public orbitAltitudeKm: number;
  public orbitalInclination: number;
  public raan: number;
  public orbitalSpeed: number;
  public phase: number;
  public solarPanelOrientation: "auto" | number;
  public radiatorConfig: RadiatorConfiguration;
  public communicationRange: number;
  public networkConnections: string[];

  // 5-Stage Deployment Animation state
  private deploymentProgress: number;
  private isDeploying: boolean;

  constructor(config: OrbitalAIDataCenterSatelliteConfig) {
    this.id = config.id;
    this.name = config.name;
    this.role = config.role ?? "primary_scout";
    this.scale = config.scale ?? 0.62;
    this.orbitRadius = config.orbitRadius ?? 5.85;
    this.orbitAltitudeKm = config.orbitAltitudeKm ?? 550;
    this.orbitalInclination = config.orbitalInclination ?? 0.9;
    this.raan = config.raan ?? 0.0;
    this.orbitalSpeed = config.orbitalSpeed ?? 0.0018;
    this.phase = config.initialPhase ?? 0.0;
    this.solarPanelOrientation = config.solarPanelOrientation ?? "auto";
    this.radiatorConfig = config.radiatorConfig ?? {
      wingCount: this.role === "flagship_datacenter" ? 4 : 2,
      thermalLoadC: 24.0,
      channelsPerPanel: 16,
    };
    this.communicationRange = config.communicationRange ?? 9.5;
    this.networkConnections = config.networkConnections ?? [];

    const autoDeploy = config.autoDeployOnEnter ?? true;
    this.deploymentProgress = autoDeploy ? 0.05 : 1.0;
    this.isDeploying = autoDeploy;

    this.root = new THREE.Group();
    this.root.name = `OrbitalAISatellite_${this.id}`;

    this.lod = new THREE.LOD();
    this.highDetailGroup = new THREE.Group();
    this.mediumDetailGroup = new THREE.Group();
    this.lowDetailGroup = new THREE.Group();

    this.computeModuleGroup = new THREE.Group();
    this.computeModuleGroup.name = "computeModule";

    this.solarAssemblyGroup = new THREE.Group();
    this.solarAssemblyGroup.name = "solarArrays";

    this.radiatorAssemblyGroup = new THREE.Group();
    this.radiatorAssemblyGroup.name = "thermalRadiators";

    this.commsAssemblyGroup = new THREE.Group();
    this.commsAssemblyGroup.name = "communicationSystems";

    this.propulsionGroup = new THREE.Group();
    this.propulsionGroup.name = "propulsionAndHardware";

    this.buildHighDetailSpacecraft();
    this.buildMediumAndLowLODs();

    this.lod.addLevel(this.highDetailGroup, 0);
    this.lod.addLevel(this.mediumDetailGroup, 7.5);
    this.lod.addLevel(this.lowDetailGroup, 15.0);

    this.root.add(this.lod);
    this.root.scale.setScalar(this.scale);

    // Apply initial deployment kinematics
    this.applyDeploymentKinematics(this.deploymentProgress);
  }

  /**
   * Build Level-0 High-Detail Aerospace Engineering Model.
   * Uses PBR materials and InstancedMesh for high-density mechanical realism.
   */
  private buildHighDetailSpacecraft(): void {
    // ── Shared Restrained Aerospace PBR Palette ──
    const darkGraphiteMat = new THREE.MeshStandardMaterial({
      color: 0x1a2028,
      metalness: 0.76,
      roughness: 0.34,
    });
    const brushedTitaniumMat = new THREE.MeshStandardMaterial({
      color: 0x8a95a5,
      metalness: 0.9,
      roughness: 0.25,
    });
    const aeroAluminiumMat = new THREE.MeshStandardMaterial({
      color: 0xc8d2dc,
      metalness: 0.92,
      roughness: 0.2,
    });
    const copperThermalMat = new THREE.MeshStandardMaterial({
      color: 0xb87333,
      metalness: 0.94,
      roughness: 0.26,
    });
    const goldMliMat = new THREE.MeshStandardMaterial({
      color: 0xc8963e,
      metalness: 0.9,
      roughness: 0.32,
    });

    // =========================================================================
    // A. CENTRAL AI COMPUTE MODULE (Heavily Engineered Rectangular Bus)
    // =========================================================================
    const busWidth = 0.54;
    const busHeight = 0.44;
    const busLength = 0.96;

    const busPanelMat = new THREE.MeshStandardMaterial({
      map: createBusPanelTexture(this.name),
      color: 0xdbe4ee,
      metalness: 0.82,
      roughness: 0.3,
    });

    const coreBus = new THREE.Mesh(
      new THREE.BoxGeometry(busWidth, busHeight, busLength),
      busPanelMat
    );
    this.computeModuleGroup.add(coreBus);

    // Titanium structural exoskeleton longerons & ribs (4 longitudinal rails + 4 lateral frames)
    const railPositions: Array<[number, number]> = [
      [busWidth * 0.505, busHeight * 0.505],
      [-busWidth * 0.505, busHeight * 0.505],
      [busWidth * 0.505, -busHeight * 0.505],
      [-busWidth * 0.505, -busHeight * 0.505],
    ];
    railPositions.forEach(([rx, ry]) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.032, 0.032, busLength + 0.02),
        brushedTitaniumMat
      );
      rail.position.set(rx, ry, 0);
      this.computeModuleGroup.add(rail);
    });

    for (let zIdx = -1.5; zIdx <= 1.5; zIdx += 1) {
      const frameRing = new THREE.Mesh(
        new THREE.BoxGeometry(busWidth + 0.028, busHeight + 0.028, 0.026),
        brushedTitaniumMat
      );
      frameRing.position.z = zIdx * 0.26;
      this.computeModuleGroup.add(frameRing);
    }

    // Gold/Copper Multi-Layer Thermal Insulation (MLI) blankets on forward and aft avionics bulkheads
    const fwdMli = new THREE.Mesh(
      new THREE.BoxGeometry(busWidth * 0.88, busHeight * 0.86, 0.14),
      goldMliMat
    );
    fwdMli.position.z = busLength * 0.46;
    this.computeModuleGroup.add(fwdMli);

    const aftMli = new THREE.Mesh(
      new THREE.BoxGeometry(busWidth * 0.9, busHeight * 0.88, 0.12),
      goldMliMat
    );
    aftMli.position.z = -busLength * 0.46;
    this.computeModuleGroup.add(aftMli);

    // InstancedMesh #1: 16 Modular AI Server Blade Cartridges (8 on Starboard +X, 8 on Port -X)
    const bladeCount = 16;
    const bladeGeom = new THREE.BoxGeometry(0.045, 0.15, 0.078);
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x111722,
      metalness: 0.86,
      roughness: 0.24,
    });
    const bladeInstanced = new THREE.InstancedMesh(bladeGeom, bladeMat, bladeCount);

    // InstancedMesh #2: 16 Subtle Cyan/Blue Status Indicator LEDs (1 on each AI Server Blade)
    const ledGeom = new THREE.BoxGeometry(0.012, 0.022, 0.012);
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const ledInstanced = new THREE.InstancedMesh(ledGeom, ledMat, bladeCount);
    this.statusLedInstancedMesh = ledInstanced;

    const dummy = new THREE.Object3D();
    let bladeIdx = 0;
    for (const side of [-1, 1]) {
      for (let row = 0; row < 2; row++) {
        for (let slot = 0; slot < 4; slot++) {
          const xPos = side * (busWidth * 0.5 + 0.012);
          const yPos = (row === 0 ? 1 : -1) * 0.105;
          const zPos = -0.24 + slot * 0.16;

          dummy.position.set(xPos, yPos, zPos);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          bladeInstanced.setMatrixAt(bladeIdx, dummy.matrix);

          dummy.position.set(xPos + side * 0.022, yPos + 0.045, zPos + 0.02);
          dummy.updateMatrix();
          ledInstanced.setMatrixAt(bladeIdx, dummy.matrix);
          bladeIdx++;
        }
      }
    }
    bladeInstanced.instanceMatrix.needsUpdate = true;
    ledInstanced.instanceMatrix.needsUpdate = true;
    this.computeModuleGroup.add(bladeInstanced);
    this.computeModuleGroup.add(ledInstanced);

    // InstancedMesh #3: 24 Structural Titanium Brackets & Fasteners along the bus chassis
    const bracketGeom = new THREE.BoxGeometry(0.036, 0.024, 0.036);
    const bracketInstanced = new THREE.InstancedMesh(bracketGeom, aeroAluminiumMat, 24);
    let bIdx = 0;
    for (const sideX of [-1, 1]) {
      for (const sideY of [-1, 1]) {
        for (let k = 0; k < 6; k++) {
          dummy.position.set(
            sideX * (busWidth * 0.51),
            sideY * (busHeight * 0.51),
            -0.42 + k * 0.168
          );
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          bracketInstanced.setMatrixAt(bIdx++, dummy.matrix);
        }
      }
    }
    bracketInstanced.instanceMatrix.needsUpdate = true;
    this.computeModuleGroup.add(bracketInstanced);

    // Flagship Data Center Role Upgrade: Twin Auxiliary High-Density Compute Pods mounted on flanks
    if (this.role === "flagship_datacenter") {
      for (const side of [-1, 1]) {
        const pod = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.28, 0.68),
          darkGraphiteMat
        );
        pod.position.set(side * 0.39, 0, 0);
        this.computeModuleGroup.add(pod);

        const podTrim = new THREE.Mesh(
          new THREE.BoxGeometry(0.19, 0.04, 0.7),
          brushedTitaniumMat
        );
        podTrim.position.set(side * 0.39, 0.13, 0);
        this.computeModuleGroup.add(podTrim);
      }
    }

    // =========================================================================
    // B. LARGE DEPLOYABLE THERMAL RADIATOR WINGS (Perpendicular to Solar Wings)
    // =========================================================================
    // Mounted on +Y (Zenith) and -Y / angled thermal rejection axes so they never collide with
    // or resemble the lateral (+/-X) photovoltaic solar arrays.
    const radTex = getSharedRadiatorTexture();
    const radiatorSurfaceMat = new THREE.MeshStandardMaterial({
      map: radTex,
      color: 0xd8e0e8,
      metalness: 0.78,
      roughness: 0.24,
      emissive: 0x082f49,
      emissiveIntensity: 0.08,
    });
    this.radiatorMaterials.push(radiatorSurfaceMat);

    // Central Ammonia Thermal Manifold & Heat-Pipe Header Block on +Y and -Y decks
    const topManifold = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.74, 16),
      copperThermalMat
    );
    topManifold.rotation.x = Math.PI / 2;
    topManifold.position.set(0, busHeight * 0.5 + 0.035, 0);
    this.radiatorAssemblyGroup.add(topManifold);

    // Configure 2 or 4 Large Deployable Radiator Wings
    const radiatorAngles =
      this.radiatorConfig.wingCount === 4
        ? [
            { ySign: 1, zOffset: 0.2, tiltX: 0.18 },
            { ySign: 1, zOffset: -0.2, tiltX: -0.18 },
            { ySign: -1, zOffset: 0.2, tiltX: -0.18 },
            { ySign: -1, zOffset: -0.2, tiltX: 0.18 },
          ]
        : [
            { ySign: 1, zOffset: 0.18, tiltX: 0.22 },
            { ySign: 1, zOffset: -0.18, tiltX: -0.22 },
          ];

    const panelW = 0.022;
    const panelH = 0.52;
    const panelL = 0.38;

    radiatorAngles.forEach((rc) => {
      const mountGroup = new THREE.Group();
      mountGroup.position.set(0, rc.ySign * (busHeight * 0.5 + 0.03), rc.zOffset);
      mountGroup.rotation.x = rc.tiltX;

      // Mechanical Hinge Base & Ammonia Coolant Flex-Loops
      const hingeBase = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.05, 0.12),
        brushedTitaniumMat
      );
      mountGroup.add(hingeBase);

      const coolantPipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, 0.18, 10),
        copperThermalMat
      );
      coolantPipe.position.set(0.055, rc.ySign * 0.06, 0);
      mountGroup.add(coolantPipe);

      // Inner Deployable Radiator Wing Panel
      const innerPanelGroup = new THREE.Group();
      innerPanelGroup.position.set(0, rc.ySign * 0.03, 0);

      const innerSlab = new THREE.Mesh(
        new THREE.BoxGeometry(panelW, panelH, panelL),
        radiatorSurfaceMat
      );
      innerSlab.position.set(0, rc.ySign * (panelH * 0.5), 0);
      innerPanelGroup.add(innerSlab);

      // Structural Titanium Perimeter Frame & Scissor Deployment Truss
      const innerFrame = new THREE.Mesh(
        new THREE.BoxGeometry(panelW + 0.008, panelH + 0.015, 0.028),
        brushedTitaniumMat
      );
      innerFrame.position.set(0, rc.ySign * (panelH * 0.5), panelL * 0.48);
      innerPanelGroup.add(innerFrame);

      const innerFrameAft = innerFrame.clone();
      innerFrameAft.position.z = -panelL * 0.48;
      innerPanelGroup.add(innerFrameAft);

      // InstancedMesh #4: 12 Physical 3D Parallel Cooling Micro-Tubes per Radiator Wing
      const tubeGeom = new THREE.CylinderGeometry(0.0045, 0.0045, panelL * 0.94, 8);
      tubeGeom.rotateX(Math.PI / 2);
      const tubeInstanced = new THREE.InstancedMesh(tubeGeom, aeroAluminiumMat, 12);
      for (let t = 0; t < 12; t++) {
        const ty = rc.ySign * (0.04 + (t / 11) * (panelH - 0.08));
        dummy.position.set(panelW * 0.55, ty, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        tubeInstanced.setMatrixAt(t, dummy.matrix);
      }
      tubeInstanced.instanceMatrix.needsUpdate = true;
      innerPanelGroup.add(tubeInstanced);

      // Outer Folding Radiator Wing Panel (Hinged at top of Inner Panel)
      const outerPanelGroup = new THREE.Group();
      outerPanelGroup.position.set(0, rc.ySign * panelH, 0);

      // Inter-panel Hinge Cylinder
      const midHinge = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, panelL * 0.95, 12),
        brushedTitaniumMat
      );
      midHinge.rotation.x = Math.PI / 2;
      outerPanelGroup.add(midHinge);

      const outerSlab = new THREE.Mesh(
        new THREE.BoxGeometry(panelW * 0.9, panelH * 0.88, panelL),
        radiatorSurfaceMat
      );
      outerSlab.position.set(0, rc.ySign * (panelH * 0.44), 0);
      outerPanelGroup.add(outerSlab);

      innerPanelGroup.add(outerPanelGroup);
      mountGroup.add(innerPanelGroup);
      this.radiatorAssemblyGroup.add(mountGroup);

      this.radiatorMounts.push(mountGroup);
      this.radiatorInnerPanels.push(innerPanelGroup);
      this.radiatorOuterPanels.push(outerPanelGroup);
    });

    // =========================================================================
    // C. QUAD DEPLOYABLE PHOTOVOLTAIC SOLAR POWER ARRAYS (4 Multi-Panel Wings)
    // =========================================================================
    const solarTex = getSharedSolarTexture();
    const solarCellMat = new THREE.MeshStandardMaterial({
      map: solarTex,
      color: 0x0b2149,
      metalness: 0.65,
      roughness: 0.22,
      emissive: 0x040d21,
      emissiveIntensity: 0.25,
    });

    // 4 Solar Array Wings: Port-Forward, Port-Aft, Starboard-Forward, Starboard-Aft
    const solarWingConfigs: Array<{ xSign: number; zOffset: number }> = [
      { xSign: 1, zOffset: 0.24 },
      { xSign: 1, zOffset: -0.24 },
      { xSign: -1, zOffset: 0.24 },
      { xSign: -1, zOffset: -0.24 },
    ];

    const segLength = 0.62;
    const segWidth = 0.28;
    const segThick = 0.014;

    solarWingConfigs.forEach(({ xSign, zOffset }) => {
      // Sun-tracking Rotary Drive Yoke mounted to lateral spacecraft wall
      const yokeGroup = new THREE.Group();
      yokeGroup.position.set(xSign * (busWidth * 0.5 + 0.02), 0, zOffset);

      // Drive Motor Drum
      const driveMotor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.038, 0.042, 0.06, 14),
        brushedTitaniumMat
      );
      driveMotor.rotation.z = Math.PI / 2;
      yokeGroup.add(driveMotor);

      // Structural Deployment Boom Yoke Arm
      const boomArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, 0.16, 10),
        aeroAluminiumMat
      );
      boomArm.rotation.z = Math.PI / 2;
      boomArm.position.x = xSign * 0.08;
      yokeGroup.add(boomArm);

      // Inner Hinged Solar Panel Segment
      const innerWing = new THREE.Group();
      innerWing.position.set(xSign * 0.15, 0, 0);

      const innerFrameMesh = new THREE.Mesh(
        new THREE.BoxGeometry(segLength, segThick, segWidth),
        brushedTitaniumMat
      );
      innerFrameMesh.position.set(xSign * (segLength * 0.5), 0, 0);
      innerWing.add(innerFrameMesh);

      const innerCells = new THREE.Mesh(
        new THREE.BoxGeometry(segLength * 0.95, segThick + 0.003, segWidth * 0.92),
        solarCellMat
      );
      innerCells.position.set(xSign * (segLength * 0.5), 0, 0);
      innerWing.add(innerCells);

      // Outer Hinged Solar Panel Segment (Accordion-folds from the tip of Inner Wing)
      const outerWing = new THREE.Group();
      outerWing.position.set(xSign * segLength, 0, 0);

      const hingeActuator = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, segWidth * 0.96, 10),
        goldMliMat
      );
      hingeActuator.rotation.x = Math.PI / 2;
      outerWing.add(hingeActuator);

      const outerFrameMesh = new THREE.Mesh(
        new THREE.BoxGeometry(segLength, segThick, segWidth),
        brushedTitaniumMat
      );
      outerFrameMesh.position.set(xSign * (segLength * 0.5), 0, 0);
      outerWing.add(outerFrameMesh);

      const outerCells = new THREE.Mesh(
        new THREE.BoxGeometry(segLength * 0.95, segThick + 0.003, segWidth * 0.92),
        solarCellMat
      );
      outerCells.position.set(xSign * (segLength * 0.5), 0, 0);
      outerWing.add(outerCells);

      innerWing.add(outerWing);
      yokeGroup.add(innerWing);
      this.solarAssemblyGroup.add(yokeGroup);

      this.solarYokes.push(yokeGroup);
      this.solarInnerWings.push(innerWing);
      this.solarOuterWings.push(outerWing);
    });

    // =========================================================================
    // D. COMMUNICATION SYSTEMS (Ka-Band Dishes & 4 Optical Laser Terminals)
    // =========================================================================
    // 1. Nadir High-Frequency Ka-Band Directional Parabolic Dish (-Y Earth-facing)
    const nadirDishBoom = new THREE.Group();
    nadirDishBoom.position.set(0, -busHeight * 0.5, 0.16);

    const boomMast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.022, 0.14, 12),
      brushedTitaniumMat
    );
    boomMast.position.y = -0.07;
    nadirDishBoom.add(boomMast);

    const dishReflector = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.065, 24, 1, true),
      aeroAluminiumMat
    );
    dishReflector.position.y = -0.14;
    nadirDishBoom.add(dishReflector);

    const feedHorn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.018, 0.07, 12),
      goldMliMat
    );
    feedHorn.position.y = -0.17;
    nadirDishBoom.add(feedHorn);

    this.commsAssemblyGroup.add(nadirDishBoom);
    this.dishBooms.push(nadirDishBoom);

    // 2. Forward High-Gain Crosslink Dish Assembly (+Z)
    const fwdDishBoom = new THREE.Group();
    fwdDishBoom.position.set(0.14, -busHeight * 0.5, -0.22);
    const auxDish = new THREE.Mesh(
      new THREE.ConeGeometry(0.105, 0.048, 20, 1, true),
      aeroAluminiumMat
    );
    auxDish.position.y = -0.09;
    fwdDishBoom.add(auxDish);
    this.commsAssemblyGroup.add(fwdDishBoom);
    this.dishBooms.push(fwdDishBoom);

    // 3. Four Optical Laser Communication Terminals (OISL / OCT Periscopes) around the spacecraft
    const octPositions: Array<[number, number, number]> = [
      [busWidth * 0.42, busHeight * 0.5, busLength * 0.38],
      [-busWidth * 0.42, busHeight * 0.5, busLength * 0.38],
      [busWidth * 0.42, -busHeight * 0.5, -busLength * 0.38],
      [-busWidth * 0.42, -busHeight * 0.5, -busLength * 0.38],
    ];

    const sapphireLensMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0x0284c7,
      emissiveIntensity: 0.45,
    });

    octPositions.forEach(([ox, oy, oz], idx) => {
      const octGroup = new THREE.Group();
      octGroup.position.set(ox, oy, oz);
      if (idx === 0) octGroup.name = "islLaserDome";

      const yDir = oy >= 0 ? 1 : -1;
      const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.036, 0.044, 0.06, 14),
        darkGraphiteMat
      );
      pedestal.position.y = yDir * 0.03;
      octGroup.add(pedestal);

      const turretHead = new THREE.Mesh(
        new THREE.SphereGeometry(0.034, 14, 12),
        brushedTitaniumMat
      );
      turretHead.position.y = yDir * 0.068;
      octGroup.add(turretHead);

      const apertureLens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.025, 12),
        sapphireLensMat
      );
      apertureLens.rotation.x = Math.PI / 2;
      apertureLens.position.set(0, yDir * 0.068, oz >= 0 ? 0.026 : -0.026);
      octGroup.add(apertureLens);

      this.commsAssemblyGroup.add(octGroup);
      this.opticalLaserHeads.push(octGroup);
    });

    // 4. Nadir SWIR / SAR Earth Observation Optical Telescope Aperture (-Y)
    const payloadHousing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.095, 0.08, 20),
      darkGraphiteMat
    );
    payloadHousing.position.set(-0.08, -busHeight * 0.5 - 0.03, -0.04);
    this.commsAssemblyGroup.add(payloadHousing);

    const payloadLens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.068, 0.015, 20),
      sapphireLensMat
    );
    payloadLens.position.set(-0.08, -busHeight * 0.5 - 0.068, -0.04);
    this.commsAssemblyGroup.add(payloadLens);

    // =========================================================================
    // E. ADDITIONAL AEROSPACE HARDWARE (RCS, Star Trackers, Reaction Wheels, Ion Propulsion)
    // =========================================================================
    // 1. InstancedMesh #5: 8 Corner Attitude Control RCS Thruster Clusters
    const rcsNozzleGeom = new THREE.ConeGeometry(0.016, 0.038, 10);
    const rcsInstanced = new THREE.InstancedMesh(rcsNozzleGeom, brushedTitaniumMat, 8);
    let rcsIdx = 0;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          dummy.position.set(
            sx * (busWidth * 0.5 + 0.018),
            sy * (busHeight * 0.46),
            sz * (busLength * 0.46)
          );
          dummy.rotation.set(0, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
          dummy.updateMatrix();
          rcsInstanced.setMatrixAt(rcsIdx++, dummy.matrix);
        }
      }
    }
    rcsInstanced.instanceMatrix.needsUpdate = true;
    this.propulsionGroup.add(rcsInstanced);

    // 2. Dual Optical Star Trackers with stray-light cylindrical baffles (+Y forward deck)
    for (const side of [-1, 1]) {
      const starTracker = new THREE.Group();
      starTracker.position.set(side * 0.14, busHeight * 0.5 + 0.02, 0.36);
      starTracker.rotation.z = side * -0.35;
      starTracker.rotation.x = 0.2;

      const baffle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.026, 0.018, 0.075, 14),
        darkGraphiteMat
      );
      baffle.position.y = 0.035;
      starTracker.add(baffle);
      this.propulsionGroup.add(starTracker);
    }

    // 3. Reaction Wheel Assembly Housing & External Power Distribution Box (Forward +Z Deck)
    const rwaHousing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.13, 0.1, 20),
      brushedTitaniumMat
    );
    rwaHousing.rotation.x = Math.PI / 2;
    rwaHousing.position.set(0, 0.04, busLength * 0.5 + 0.04);
    this.propulsionGroup.add(rwaHousing);

    const pduBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.11, 0.07),
      darkGraphiteMat
    );
    pduBox.position.set(0, -0.11, busLength * 0.5 + 0.03);
    this.propulsionGroup.add(pduBox);

    // 4. Aft Hall-Effect Ion Propulsion Thruster & Twin Spherical Xenon Propellant Tanks (-Z)
    for (const side of [-1, 1]) {
      const xenonTank = new THREE.Mesh(
        new THREE.SphereGeometry(0.088, 16, 14),
        brushedTitaniumMat
      );
      xenonTank.position.set(side * 0.14, 0, -busLength * 0.5 - 0.03);
      this.propulsionGroup.add(xenonTank);

      const tankBand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.091, 0.091, 0.02, 16),
        goldMliMat
      );
      tankBand.rotation.x = Math.PI / 2;
      tankBand.position.copy(xenonTank.position);
      this.propulsionGroup.add(tankBand);
    }

    // Central Hall-Effect Ion Thruster Discharge Ring (Restrained realistic engineering — no oversized glow)
    const ionAnode = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.09, 0.09, 20),
      darkGraphiteMat
    );
    ionAnode.rotation.x = Math.PI / 2;
    ionAnode.position.set(0, 0, -busLength * 0.5 - 0.05);
    this.propulsionGroup.add(ionAnode);

    // Subtle xenon ion beam plume (kept named "thrusterPlume" for flight telemetry compatibility)
    const plumeMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.26, 16), plumeMat);
    plume.name = "thrusterPlume";
    plume.rotation.x = -Math.PI / 2;
    plume.position.set(0, 0, -busLength * 0.5 - 0.19);
    this.propulsionGroup.add(plume);

    // Subtle lateral RCS attitude puffs (named "rcsLeft" & "rcsRight" for steering feedback)
    const rcsPuffMat = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const rcsLeft = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.14, 10), rcsPuffMat.clone());
    rcsLeft.name = "rcsLeft";
    rcsLeft.rotation.z = Math.PI / 2;
    rcsLeft.position.set(-(busWidth * 0.5 + 0.09), 0.05, 0.34);
    this.propulsionGroup.add(rcsLeft);

    const rcsRight = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.14, 10), rcsPuffMat.clone());
    rcsRight.name = "rcsRight";
    rcsRight.rotation.z = -Math.PI / 2;
    rcsRight.position.set(busWidth * 0.5 + 0.09, 0.05, 0.34);
    this.propulsionGroup.add(rcsRight);

    // Assemble High-Detail Level 0 Group
    this.highDetailGroup.add(this.computeModuleGroup);
    this.highDetailGroup.add(this.radiatorAssemblyGroup);
    this.highDetailGroup.add(this.solarAssemblyGroup);
    this.highDetailGroup.add(this.commsAssemblyGroup);
    this.highDetailGroup.add(this.propulsionGroup);
  }

  /**
   * Build Medium (Level 1) and Distant Silhouette (Level 2) LOD meshes so constellation
   * satellites retain their unmistakable Quad-Solar + Perpendicular-Radiator silhouette at any distance.
   */
  private buildMediumAndLowLODs(): void {
    const busMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.85,
      roughness: 0.28,
    });
    const solarMat = new THREE.MeshStandardMaterial({
      color: 0x0b2149,
      metalness: 0.7,
      roughness: 0.25,
    });
    const radMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      metalness: 0.8,
      roughness: 0.25,
    });

    // Medium LOD (Level 1)
    const medBus = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.44, 0.96), busMat);
    this.mediumDetailGroup.add(medBus);

    [-0.24, 0.24].forEach((zOff) => {
      const solarSpan = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.016, 0.26), solarMat);
      solarSpan.position.set(0, 0, zOff);
      this.mediumDetailGroup.add(solarSpan);
    });

    const medRad = new THREE.Mesh(new THREE.BoxGeometry(0.024, 1.15, 0.72), radMat);
    medRad.position.set(0, 0.58, 0);
    this.mediumDetailGroup.add(medRad);

    // Low LOD (Level 2 — Distant Full-Earth Silhouette)
    const lowBus = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.46, 0.96), busMat);
    const lowSolar = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.02, 0.65), solarMat);
    const lowRad = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.2, 0.7), radMat);
    lowRad.position.y = 0.55;
    this.lowDetailGroup.add(lowBus, lowSolar, lowRad);
  }

  /**
   * Trigger or replay the 5-stage mechanical deployment sequence from folded launch configuration.
   */
  public triggerDeployment(): void {
    this.deploymentProgress = 0.0;
    this.isDeploying = true;
    this.applyDeploymentKinematics(0.0);
  }

  /**
   * Advance the 5-stage deployment sequence and return current stage status.
   */
  public updateDeployment(dt: number): DeploymentStageStatus {
    if (this.isDeploying) {
      this.deploymentProgress = Math.min(1.0, this.deploymentProgress + dt * 0.26);
      this.applyDeploymentKinematics(this.deploymentProgress);
      if (this.deploymentProgress >= 1.0) {
        this.isDeploying = false;
      }
    }
    return this.getDeploymentStatus();
  }

  public getDeploymentStatus(): DeploymentStageStatus {
    const p = this.deploymentProgress;
    let stageIndex: 1 | 2 | 3 | 4 | 5 = 5;
    let stageLabel = "Nominal Orbital AI Operation";
    if (p < 0.18) {
      stageIndex = 1;
      stageLabel = "Stage 1/5: Central AI Compute Bus Separation";
    } else if (p < 0.52) {
      stageIndex = 2;
      stageLabel = "Stage 2/5: Unfolding Quad Solar Power Arrays";
    } else if (p < 0.78) {
      stageIndex = 3;
      stageLabel = "Stage 3/5: Deploying Thermal Radiator Wings";
    } else if (p < 0.94) {
      stageIndex = 4;
      stageLabel = "Stage 4/5: Extending Optical Laser & Ka-Band Comms";
    }
    return {
      progress: p,
      stageIndex,
      stageLabel,
      isDeployed: p >= 1.0,
    };
  }

  /**
   * Apply smooth, mechanically synchronized kinematics for all 5 deployment stages:
   * 1. Central module appearance & latch release (0.00 -> 0.18)
   * 2. Solar arrays unfold smoothly (0.18 -> 0.52)
   * 3. Thermal radiator wings deploy mechanically (0.52 -> 0.78)
   * 4. Communication antennas & optical laser heads extend (0.78 -> 0.94)
   * 5. Nominal operation & status LED activation (0.94 -> 1.00)
   */
  private applyDeploymentKinematics(progress: number): void {
    const smooth = (t: number) => t * t * (3 - 2 * t);
    const stage1 = smooth(THREE.MathUtils.clamp(progress / 0.18, 0, 1));
    const stage2 = smooth(THREE.MathUtils.clamp((progress - 0.18) / 0.34, 0, 1));
    const stage3 = smooth(THREE.MathUtils.clamp((progress - 0.52) / 0.26, 0, 1));
    const stage4 = smooth(THREE.MathUtils.clamp((progress - 0.78) / 0.16, 0, 1));

    // 1. Central Spacecraft Bus appearance
    const entryScale = this.scale * (0.72 + 0.28 * stage1);
    this.root.scale.setScalar(entryScale);

    // 2. Solar Array Wings Unfold (Folded flat against flanks -> 90 deg deployed)
    this.solarInnerWings.forEach((inner, idx) => {
      const xSign = idx < 2 ? 1 : -1;
      inner.rotation.z = xSign * (1 - stage2) * (Math.PI * 0.48);
    });
    this.solarOuterWings.forEach((outer, idx) => {
      const xSign = idx < 2 ? 1 : -1;
      outer.rotation.z = -xSign * (1 - stage2) * (Math.PI * 0.88);
    });

    // 3. Large Thermal Radiator Wings Deploy Mechanically
    this.radiatorInnerPanels.forEach((inner, idx) => {
      const dir = idx % 2 === 0 ? 1 : -1;
      inner.rotation.z = dir * (1 - stage3) * (Math.PI * 0.46);
    });
    this.radiatorOuterPanels.forEach((outer, idx) => {
      const dir = idx % 2 === 0 ? -1 : 1;
      outer.rotation.z = dir * (1 - stage3) * (Math.PI * 0.85);
    });

    // 4. Communication Dishes & Optical Laser Terminals Extend
    this.dishBooms.forEach((boom) => {
      boom.rotation.x = (1 - stage4) * (Math.PI * 0.45);
      boom.scale.setScalar(0.4 + 0.6 * stage4);
    });
    this.opticalLaserHeads.forEach((oct) => {
      oct.scale.setScalar(0.35 + 0.65 * stage4);
    });

    // 5. Server Blade Status LEDs Activate in Stage 5
    if (this.statusLedInstancedMesh) {
      this.statusLedInstancedMesh.visible = progress >= 0.85;
    }
  }

  /**
   * Orient solar panel rotary yokes toward the world-space Sun vector while keeping
   * thermal radiators shaded edge-on and updating subtle radiator thermal states.
   */
  public updateOrbitalSystems(
    sunDirectionWorld: THREE.Vector3,
    thermalTempC: number,
    cameraWorldPos?: THREE.Vector3
  ): void {
    this.radiatorConfig.thermalLoadC = thermalTempC;

    if (cameraWorldPos) {
      this.lod.update(
        ({ position: cameraWorldPos } as unknown) as THREE.Camera
      );
    }

    // 1. Orient Quad Solar Arrays toward the Sun around their rotary drive axis (X-axis)
    if (this.solarPanelOrientation === "auto") {
      const invQuat = this.root.quaternion.clone().invert();
      const localSun = sunDirectionWorld.clone().applyQuaternion(invQuat).normalize();
      const targetPitch = Math.atan2(localSun.z, Math.max(0.15, Math.abs(localSun.y)));
      const clampedPitch = THREE.MathUtils.clamp(targetPitch, -1.1, 1.1);
      this.solarYokes.forEach((yoke) => {
        yoke.rotation.x = THREE.MathUtils.lerp(yoke.rotation.x, clampedPitch, 0.08);
      });
    } else {
      const fixedAngle = this.solarPanelOrientation;
      this.solarYokes.forEach((yoke) => {
        yoke.rotation.x = fixedAngle;
      });
    }

    // 2. Subtle thermal-state coloration on radiator panels (never excessive glow)
    this.radiatorMaterials.forEach((mat) => {
      if (thermalTempC >= 44) {
        mat.emissive.setHex(0xb45309);
        mat.emissiveIntensity = 0.22;
      } else if (thermalTempC >= 34) {
        mat.emissive.setHex(0x854d0e);
        mat.emissiveIntensity = 0.14;
      } else {
        mat.emissive.setHex(0x082f49);
        mat.emissiveIntensity = 0.06;
      }
    });
  }
}

/**
 * Convenience factory for creating a Next-Generation Orbital AI Data Center Satellite.
 */
export function createOrbitalAIDataCenterSatellite(
  config: OrbitalAIDataCenterSatelliteConfig
): OrbitalAIDataCenterSatellite {
  return new OrbitalAIDataCenterSatellite(config);
}

