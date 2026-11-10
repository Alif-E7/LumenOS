import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createOrbitalAIDataCenterSatellite } from "../../lib/orbital-ai-satellite";

export type ShipArchetype = "scout" | "tank" | "sprinter";
export type SubsystemSize = "S" | "M" | "L";

const ARCHETYPE_CONFIG: Record<
  ShipArchetype,
  {
    code: string;
    roleName: string;
    wingCount: 2 | 4;
    thermalLoadC: number;
    baseScale: number;
    accentHex: string;
    computeSpec: string;
  }
> = {
  scout: {
    code: "LUMEN-6U-RECON",
    roleName: "Balanced SSO Edge-AI Recon Bus",
    wingCount: 2,
    thermalLoadC: 26,
    baseScale: 1.05,
    accentHex: "#38bdf8",
    computeSpec: "24 TOPS Rad-Hard NPU · 2x Radiator Wings",
  },
  tank: {
    code: "SENTINEL-RAD-HARD",
    roleName: "Heavy Whipple-Shielded Deep-Eclipse Bus",
    wingCount: 4,
    thermalLoadC: 34,
    baseScale: 1.12,
    accentHex: "#10b981",
    computeSpec: "24 TOPS TMR-Shielded · 4x Radiator Wings",
  },
  sprinter: {
    code: "HYPERION-DC-HEO",
    roleName: "High-Power Orbital AI Data Center Bus",
    wingCount: 4,
    thermalLoadC: 44,
    baseScale: 1.18,
    accentHex: "#f59e0b",
    computeSpec: "24 TOPS Dual-Blade · 4x Active Louver Wings",
  },
};

/**
 * Aerospace Cleanroom & Orbital Preview of the player's Next-Gen AI Data Center Spacecraft.
 * Uses the modular `OrbitalAIDataCenterSatellite` engineering assembly with:
 * - Interactive mouse drag (orbit 360°) & scroll wheel zoom
 * - Live 5-Stage Mechanical Deployment test button
 * - Dynamic visual response to archetype & S/M/L subsystem selections
 */
export function ShipPreview3D({
  archetype,
  batterySize = "M",
  solarSize = "M",
  antennaSize = "M",
  className = "",
}: {
  archetype: ShipArchetype;
  batterySize?: SubsystemSize;
  solarSize?: SubsystemSize;
  antennaSize?: SubsystemSize;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const deployTriggerRef = useRef(0);
  const [stageLabel, setStageLabel] = useState<string>("Stage 5/5: Nominal Orbital AI Operation");
  const [isDeployingUi, setIsDeployingUi] = useState(false);

  const cfg = ARCHETYPE_CONFIG[archetype];

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 480;
    const height = container.clientHeight || 320;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030711);

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.35;
      container.replaceChildren(renderer.domElement);
    } catch {
      // Fallback for headless test environments (jsdom without WebGL context)
      return;
    }

    // 1. Deep-Space Starfield & Subtle Orbital Grid Ring
    const starCount = 320;
    const starGeom = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 28;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 18;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 28;
    }
    starGeom.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0x94a3b8,
      size: 0.06,
      transparent: true,
      opacity: 0.65,
    });
    scene.add(new THREE.Points(starGeom, starMat));

    // Subtle holographic CAD turntable ring below the spacecraft
    const cadRingGroup = new THREE.Group();
    cadRingGroup.position.y = -0.88;
    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(1.45, 1.48, 64),
      new THREE.MeshBasicMaterial({
        color: 0x0ea5e9,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      })
    );
    outerRing.rotation.x = Math.PI / 2;
    cadRingGroup.add(outerRing);

    const innerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 0.965, 48),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
      })
    );
    innerRing.rotation.x = Math.PI / 2;
    cadRingGroup.add(innerRing);
    scene.add(cadRingGroup);

    // 2. Aerospace Studio & Earth-Albedo Lighting
    const sunKeyLight = new THREE.DirectionalLight(0xfffbeb, 3.1);
    sunKeyLight.position.set(5, 4, 5);
    scene.add(sunKeyLight);

    const earthAlbedoFill = new THREE.DirectionalLight(0x38bdf8, 1.45);
    earthAlbedoFill.position.set(-4, -3, -2);
    scene.add(earthAlbedoFill);

    const rimLight = new THREE.DirectionalLight(0xf59e0b, 0.9);
    rimLight.position.set(0, 3, -5);
    scene.add(rimLight);

    const ambientLight = new THREE.AmbientLight(0x1e293b, 0.95);
    scene.add(ambientLight);

    // 3. Instantiate the Aerospace-Grade Modular Orbital AI Data Center Satellite
    const sat = createOrbitalAIDataCenterSatellite({
      id: `hangar_${archetype}`,
      name: cfg.code,
      role: archetype === "sprinter" ? "flagship_datacenter" : "primary_scout",
      scale: cfg.baseScale,
      orbitRadius: 6.0,
      orbitalInclination: 0.85,
      orbitalSpeed: 0.002,
      radiatorConfig: {
        wingCount: cfg.wingCount,
        thermalLoadC: cfg.thermalLoadC,
      },
      communicationRange: 10.0,
      autoDeployOnEnter: false,
    });

    // Apply subsystem size customizations to the 3D assemblies
    const solarScaleMultiplier = solarSize === "L" ? 1.24 : solarSize === "S" ? 0.78 : 1.0;
    sat.solarAssemblyGroup.scale.set(solarScaleMultiplier, 1.0, solarScaleMultiplier);

    const commScaleMultiplier = antennaSize === "L" ? 1.28 : antennaSize === "S" ? 0.82 : 1.0;
    sat.commsAssemblyGroup.scale.setScalar(commScaleMultiplier);

    const busLengthMultiplier = batterySize === "L" ? 1.12 : batterySize === "S" ? 0.92 : 1.0;
    sat.computeModuleGroup.scale.set(1.0, 1.0, busLengthMultiplier);

    scene.add(sat.root);

    // Interactive Orbit Camera State
    let camYaw = 0.65;
    let camPitch = 0.32;
    let camDist = 3.25;
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;
    let lastDeployTrigger = deployTriggerRef.current;

    const onPointerDown = (e: MouseEvent) => {
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
    };
    const onPointerMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      prevX = e.clientX;
      prevY = e.clientY;
      camYaw -= dx * 0.008;
      camPitch = Math.max(-0.65, Math.min(0.85, camPitch + dy * 0.006));
    };
    const onPointerUp = () => {
      isDragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camDist = Math.max(2.0, Math.min(5.2, camDist + e.deltaY * 0.0025));
    };

    const domEl = renderer.domElement;
    domEl.addEventListener("mousedown", onPointerDown);
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);
    domEl.addEventListener("wheel", onWheel, { passive: false });

    let animId: number;
    let clock = 0;
    const sunDir = new THREE.Vector3(1, 0.4, 0.6).normalize();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const dt = 0.016;
      clock += dt;

      if (deployTriggerRef.current !== lastDeployTrigger) {
        lastDeployTrigger = deployTriggerRef.current;
        sat.triggerDeployment();
        setIsDeployingUi(true);
      }

      const deployState = sat.updateDeployment(dt);
      if (Math.floor(clock * 10) % 3 === 0) {
        setStageLabel(deployState.stageLabel);
        setIsDeployingUi(!deployState.isDeployed);
      }

      sat.updateOrbitalSystems(
        sunDir,
        cfg.thermalLoadC + 4 * Math.sin(clock * 1.5)
      );
      sat.lod.update(camera);

      // Gentle auto-turntable rotation when not dragging
      if (!isDragging) {
        camYaw += 0.0038;
      }
      sat.root.position.y = Math.sin(clock * 1.4) * 0.035;
      cadRingGroup.rotation.y = -clock * 0.2;

      camera.position.set(
        camDist * Math.cos(camPitch) * Math.sin(camYaw),
        camDist * Math.sin(camPitch),
        camDist * Math.cos(camPitch) * Math.cos(camYaw)
      );
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 480;
      const h = container.clientHeight || 320;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      domEl.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("mouseup", onPointerUp);
      domEl.removeEventListener("wheel", onWheel);
      renderer.dispose();
    };
  }, [archetype, batterySize, solarSize, antennaSize, cfg.baseScale, cfg.code, cfg.thermalLoadC, cfg.wingCount]);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-[#030711] shadow-[0_0_40px_rgba(6,182,212,0.08)] select-none ${className}`}
    >
      {/* Top-Left Cleanroom CAD Telemetry Header */}
      <div className="absolute top-3 left-3.5 z-10 pointer-events-none">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">
            {cfg.code} · CAD CLEANROOM
          </span>
        </div>
        <div className="text-[11px] font-mono text-slate-400 mt-0.5">{cfg.computeSpec}</div>
      </div>

      {/* Top-Right Interactive 5-Stage Deployment Trigger */}
      <div className="absolute top-3 right-3.5 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            deployTriggerRef.current += 1;
          }}
          className="px-2.5 py-1 rounded-lg border border-cyan-400/40 bg-cyan-950/70 hover:bg-cyan-900/80 text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-200 transition-all cursor-pointer shadow-md"
          title="Test 5-Stage Mechanical Solar & Radiator Wing Deployment Kinematics"
        >
          ⚙️ {isDeployingUi ? "Deploying..." : "Test Deployment"}
        </button>
      </div>

      {/* 3D WebGL Viewport */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Bottom Telemetry Bar */}
      <div className="absolute bottom-2.5 left-3.5 right-3.5 flex items-center justify-between pointer-events-none font-mono text-[10px]">
        <span className="px-2 py-0.5 rounded bg-slate-950/85 border border-slate-800 text-cyan-300">
          {stageLabel}
        </span>
        <span className="text-slate-400 hidden sm:inline">
          Drag to Rotate 360° · Scroll to Zoom
        </span>
      </div>
    </div>
  );
}
