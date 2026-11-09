import { useEffect, useRef } from "react";
import * as THREE from "three";

export type ShipArchetype = "scout" | "tank" | "sprinter";

const ARCHETYPE_TINT: Record<ShipArchetype, number> = {
  scout: 0x38bdf8,
  tank: 0x34d399,
  sprinter: 0xfbbf24,
};

/**
 * 3D rotating preview of the player's spacecraft built with Three.js.
 * Displays the metallic bus, gold-foil MLI blanket, archetype-tinted solar panels,
 * parabolic dish, and glowing ion thruster, gently rotating against a starfield.
 */
export function ShipPreview3D({
  archetype,
  className = "",
}: {
  archetype: ShipArchetype;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 320;
    const height = container.clientHeight || 260;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060913);

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(2.4, 1.2, 2.8);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    container.replaceChildren(renderer.domElement);

    // Subtle star dust particles in background
    const starCount = 120;
    const starGeom = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 20;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 20;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    starGeom.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0x94a3b8, size: 0.08, transparent: true, opacity: 0.6 });
    scene.add(new THREE.Points(starGeom, starMat));

    // Studio lighting
    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.5);
    keyLight.position.set(4, 5, 4);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
    fillLight.position.set(-4, -2, -3);
    scene.add(fillLight);

    const ambientLight = new THREE.AmbientLight(0x1e293b, 0.8);
    scene.add(ambientLight);

    // 3D Spacecraft Model
    const shipGroup = new THREE.Group();
    scene.add(shipGroup);

    // Main bus
    const busMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.2 });
    const bus = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.6), busMat);
    shipGroup.add(bus);

    // Gold foil wrap
    const foilMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.95, roughness: 0.35 });
    const foil = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.35, 0.62), foilMat);
    shipGroup.add(foil);

    // Archetype-tinted Solar Wings
    const tintColor = ARCHETYPE_TINT[archetype];
    const solarMat = new THREE.MeshStandardMaterial({ color: tintColor, metalness: 0.6, roughness: 0.25 });
    const wingGeom = new THREE.BoxGeometry(0.55, 0.02, 1.3);

    const rightWing = new THREE.Mesh(wingGeom, solarMat);
    rightWing.position.set(0, 0, 1.05);
    shipGroup.add(rightWing);

    const leftWing = new THREE.Mesh(wingGeom, solarMat);
    leftWing.position.set(0, 0, -1.05);
    shipGroup.add(leftWing);

    // White antenna dish
    const dishMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
    const dish = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.12, 24, 1, true), dishMat);
    dish.rotation.x = Math.PI;
    dish.position.set(0, -0.42, 0);
    shipGroup.add(dish);

    // Thruster nozzle with glowing plume
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9 });
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.06, 0.18, 16), nozzleMat);
    nozzle.rotation.z = Math.PI / 2;
    nozzle.position.set(-0.48, 0, 0);
    shipGroup.add(nozzle);

    const plumeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 });
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 16), plumeMat);
    plume.rotation.z = -Math.PI / 2;
    plume.position.set(-0.7, 0, 0);
    shipGroup.add(plume);

    let animId: number;
    let clock = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      clock += 0.016;

      // Slow smooth rotation
      shipGroup.rotation.y = clock * 0.45;
      shipGroup.rotation.x = Math.sin(clock * 0.3) * 0.15;

      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 320;
      const h = container.clientHeight || 260;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
    };
  }, [archetype]);

  return (
    <div className={`relative overflow-hidden bg-void rounded-2xl border border-edge ${className}`}>
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute bottom-2 left-0 right-0 text-center pointer-events-none">
        <span className="text-[11px] text-faint uppercase tracking-wider">Your ship · 3D live preview</span>
      </div>
    </div>
  );
}
