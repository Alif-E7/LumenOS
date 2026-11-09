import { useEffect, useRef, useState } from "react";

export type ShipArchetype = "scout" | "tank" | "sprinter";

const ARCHETYPE_TINT: Record<ShipArchetype, string> = {
  scout: "#38bdf8",
  tank: "#34d399",
  sprinter: "#fbbf24",
};

/**
 * Small rotating 3D preview of the player's spacecraft (the same glTF used
 * in flight). No globe — the ship floats among the stars and slowly spins.
 * Falls back to a big emoji ship when WebGL is unavailable.
 */
export function ShipPreview3D({
  archetype,
  className = "",
}: {
  archetype: ShipArchetype;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<any>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;
    let isMounted = true;
    let removed = false;

    try {
      const canvas = document.createElement("canvas");
      const hasWebGL = !!(
        window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
      );
      if (!hasWebGL) {
        setFailed(true);
        return;
      }
    } catch {
      setFailed(true);
      return;
    }

    async function init() {
      try {
        const Cesium = await import("cesium");
        if (!isMounted || !containerRef.current || removed) return;
        Cesium.Ion.defaultAccessToken = "";

        const viewer = new Cesium.Viewer(containerRef.current, {
          baseLayer: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          baseLayerPicker: false,
          navigationHelpButton: false,
          animation: false,
          timeline: false,
          fullscreenButton: false,
          infoBox: false,
          selectionIndicator: false,
          shouldAnimate: true,
          requestRenderMode: false,
        });
        viewerRef.current = viewer;
        viewer.scene.globe.show = false;
        if (viewer.scene.skyBox) viewer.scene.skyBox.show = true;
        if (viewer.scene.moon) viewer.scene.moon.show = false;

        // Ship floats at a fixed "studio" point in space
        const shipPos = Cesium.Cartesian3.fromDegrees(0, 0, 2_000_000);
        viewer.entities.add({
          name: "Your Ship",
          position: shipPos,
          orientation: Cesium.Transforms.headingPitchRollQuaternion(
            shipPos,
            new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(25), 0, 0)
          ),
          model: {
            uri: "/models/lumen-satellite.glb",
            minimumPixelSize: 220,
            maximumScale: 20000,
            scale: 1.0,
            silhouetteColor: Cesium.Color.fromCssColorString(ARCHETYPE_TINT[archetype]),
            silhouetteSize: 2.5,
          },
        });

        // Slow cinematic orbit around the ship
        const radius = 18;
        viewer.clock.onTick.addEventListener((clock: any) => {
          const t = clock.currentTime.secondsOfDay;
          const heading = Cesium.Math.toRadians(t * 8);
          viewer.camera.lookAt(
            shipPos,
            new Cesium.HeadingPitchRange(heading, Cesium.Math.toRadians(-15), radius)
          );
        });
      } catch {
        if (isMounted) setFailed(true);
      }
    }

    void init();

    return () => {
      isMounted = false;
      removed = true;
      try {
        if (viewerRef.current && !viewerRef.current.isDestroyed()) {
          viewerRef.current.destroy();
        }
      } catch {
        /* ignore */
      }
      viewerRef.current = null;
    };
    // Rebuild only when the archetype (silhouette tint) changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archetype]);

  if (failed) {
    const emoji = { scout: "🛰️", tank: "🚀", sprinter: "✨" }[archetype];
    return (
      <div className={`flex items-center justify-center bg-void rounded-2xl border border-edge ${className}`}>
        <div className="text-7xl animate-bounce">{emoji}</div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-void rounded-2xl border border-edge ${className}`}>
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute bottom-2 left-0 right-0 text-center pointer-events-none">
        <span className="text-[11px] text-faint uppercase tracking-wider">Your ship · 3D preview</span>
      </div>
    </div>
  );
}
