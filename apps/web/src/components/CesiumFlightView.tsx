import { useEffect, useRef, useState, useCallback } from "react";
import type { OrbitalTelemetry, CommsTelemetry, ClockState } from "../types";
import { AccessibleMissionMap } from "./AccessibleMissionMap";
import { resolveEarthImagery, type EarthImagerySource } from "../lib/earth-imagery";
import {
  GROUND_STATIONS,
  SCENARIO_TARGETS,
  calculateFootprintRadiusKm,
} from "../lib/mission-geometry";

export interface CesiumFlightViewProps {
  orbital?: OrbitalTelemetry | null;
  comms?: CommsTelemetry | null;
  clock?: ClockState | null;
  scenarioId?: string;
  groundTrackPoints?: Array<{ latitude_deg: number; longitude_deg: number; altitude_km?: number }>;
  className?: string;
}

type FlightCamera = "cinematic" | "ridealong" | "free";

/**
 * Kid-mode fullscreen 3D flight view.
 *
 * Renders the Lumen-1 spacecraft as a real 3D glTF model orbiting a
 * photo-realistic Earth (online Sentinel-2 imagery, offline fallback),
 * with three camera modes: Cinematic chase, Ride-along, and Free.
 * Falls back to the accessible 2D map when WebGL is unavailable.
 */
export function CesiumFlightView({
  orbital,
  comms,
  clock,
  scenarioId,
  groundTrackPoints = [],
  className = "",
}: CesiumFlightViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<any>(null);
  const cesiumRef = useRef<any>(null);
  const imagerySourceRef = useRef<EarthImagerySource>("none");
  const entitiesRef = useRef<{
    satellite?: any;
    orbitLine?: any;
    groundTrack?: any;
    footprint?: any;
    rfBeam?: any;
    stations: Map<string, any>;
    targets: Map<string, any>;
  }>({ stations: new Map(), targets: new Map() });

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [imagerySource, setImagerySource] = useState<EarthImagerySource>("none");
  const [cameraMode, setCameraMode] = useState<FlightCamera>("cinematic");

  const satLat = orbital?.latitude_deg ?? 0.0;
  const satLon = orbital?.longitude_deg ?? 0.0;
  const satAltKm = orbital?.altitude_km ?? 550.0;
  const inEclipse = orbital?.in_eclipse ?? false;

  function isWebGLAvailable(): boolean {
    if (typeof window === "undefined" || !window.document) return false;
    try {
      const canvas = document.createElement("canvas");
      return !!(
        window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
      );
    } catch {
      return false;
    }
  }
  const [webGLSupported] = useState<boolean>(() => isWebGLAvailable());
  const useFallback = !webGLSupported;

  // ── Initialize viewer, imagery, model, and static entities ─────────────────
  useEffect(() => {
    if (useFallback || !containerRef.current || viewerRef.current) return;
    let isMounted = true;

    async function init() {
      try {
        const Cesium = await import("cesium");
        if (!isMounted || !containerRef.current) return;
        cesiumRef.current = Cesium;
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
          shouldAnimate: clock?.status === "RUNNING",
          requestRenderMode: false,
        });
        viewerRef.current = viewer;

        // Photo-realistic Earth (online) with bundled offline fallback
        const imagery = await resolveEarthImagery(Cesium);
        if (imagery.provider) viewer.imageryLayers.addImageryProvider(imagery.provider as any);
        imagerySourceRef.current = imagery.source;
        if (isMounted) setImagerySource(imagery.source);

        // Cinematic look: sun lighting, atmosphere, stars, dark space
        viewer.scene.globe.enableLighting = true;
        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#090d16");
        if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;
        if (viewer.scene.skyBox) viewer.scene.skyBox.show = true;
        if (viewer.scene.moon) viewer.scene.moon.show = false;
        viewer.scene.fog.enabled = false;

        // ── Ground stations ─────────────────────────────────────────────
        GROUND_STATIONS.forEach((gs) => {
          const stationEntity = viewer.entities.add({
            name: gs.name,
            position: Cesium.Cartesian3.fromDegrees(gs.longitude, gs.latitude, gs.altitudeMeters),
            point: {
              pixelSize: 8,
              color: Cesium.Color.fromCssColorString("#10b981"),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 1,
            },
            label: {
              text: gs.name.split(" ")[0],
              font: "13px sans-serif",
              fillColor: Cesium.Color.fromCssColorString("#a7f3d0"),
              pixelOffset: new Cesium.Cartesian2(0, -14),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
          entitiesRef.current.stations.set(gs.id, stationEntity);
        });

        // ── Scenario targets ────────────────────────────────────────────
        const targetsToRender = scenarioId
          ? SCENARIO_TARGETS.filter((t) => t.scenarioId === scenarioId)
          : SCENARIO_TARGETS;
        targetsToRender.forEach((tgt) => {
          const targetEntity = viewer.entities.add({
            name: tgt.name,
            position: Cesium.Cartesian3.fromDegrees(tgt.longitude, tgt.latitude, 0),
            point: {
              pixelSize: 10,
              color: Cesium.Color.fromCssColorString(tgt.colorHex),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
            },
            label: {
              text: tgt.name.split(" ")[0],
              font: "13px sans-serif",
              fillColor: Cesium.Color.WHITE,
              pixelOffset: new Cesium.Cartesian2(0, 16),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
          entitiesRef.current.targets.set(tgt.id, targetEntity);
        });

        // ── Spacecraft: real 3D model (glTF) ────────────────────────────
        const initialPos = Cesium.Cartesian3.fromDegrees(satLon, satLat, satAltKm * 1000);
        const modelUri = "/models/lumen-satellite.glb";
        const satEntity = viewer.entities.add({
          name: "LUMEN-1",
          position: initialPos,
          orientation: Cesium.Transforms.headingPitchRollQuaternion(
            initialPos,
            new Cesium.HeadingPitchRoll(0, 0, 0)
          ),
          model: {
            uri: modelUri,
            minimumPixelSize: 96,
            maximumScale: 60000,
            scale: 1.0,
            show: true,
            silhouetteColor: Cesium.Color.fromCssColorString("#38bdf8").withAlpha(0.6),
            silhouetteSize: 1.5,
          },
          label: {
            text: "LUMEN-1",
            font: "14px sans-serif",
            fillColor: Cesium.Color.fromCssColorString("#67e8f9"),
            pixelOffset: new Cesium.Cartesian2(0, -40),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        entitiesRef.current.satellite = satEntity;

        // ── Sensor footprint ────────────────────────────────────────────
        const footprintRadiusMeters = calculateFootprintRadiusKm(satAltKm, 30.0) * 1000;
        entitiesRef.current.footprint = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(satLon, satLat, 0),
          ellipse: {
            semiMajorAxis: footprintRadiusMeters,
            semiMinorAxis: footprintRadiusMeters,
            material: Cesium.Color.fromCssColorString("#38bdf8").withAlpha(0.18),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString("#38bdf8").withAlpha(0.9),
            outlineWidth: 2,
          },
        });

        if (isMounted) setReady(true);
      } catch {
        if (isMounted) setFailed(true);
      }
    }

    void init();

    return () => {
      isMounted = false;
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
        cesiumRef.current = null;
      }
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useFallback]);

  // ── Per-tick updates: satellite pose, footprint, RF beam ───────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium || viewer.isDestroyed() || !ready) return;

    const satPos = Cesium.Cartesian3.fromDegrees(satLon, satLat, satAltKm * 1000);
    const subSatPos = Cesium.Cartesian3.fromDegrees(satLon, satLat, 0);
    const sat = entitiesRef.current.satellite;

    if (sat) {
      sat.position = satPos;
      // Orient nose along the velocity direction (approx. east for prograde
      // LEO), wings level, dish facing Earth. Cosmetic — never break the loop.
      try {
        const hpr = new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(90), 0, 0);
        sat.orientation = Cesium.Transforms.headingPitchRollQuaternion(satPos, hpr);
      } catch {
        /* orientation is cosmetic */
      }
    }

    if (entitiesRef.current.footprint) {
      entitiesRef.current.footprint.position = subSatPos;
      const r = calculateFootprintRadiusKm(satAltKm, 30.0) * 1000;
      entitiesRef.current.footprint.ellipse.semiMajorAxis = r;
      entitiesRef.current.footprint.ellipse.semiMinorAxis = r;
    }

    // RF beam to the active ground station
    if (comms?.in_contact && comms.active_station) {
      const gs = GROUND_STATIONS.find((s) =>
        comms.active_station?.toLowerCase().includes(s.id)
      );
      if (gs) {
        const gsPos = Cesium.Cartesian3.fromDegrees(gs.longitude, gs.latitude, gs.altitudeMeters);
        if (!entitiesRef.current.rfBeam) {
          entitiesRef.current.rfBeam = viewer.entities.add({
            name: "Data Beam",
            polyline: {
              positions: [gsPos, satPos],
              width: 6,
              material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.25,
                color: Cesium.Color.fromCssColorString("#22d3ee"),
              }),
            },
          });
        } else {
          entitiesRef.current.rfBeam.polyline.positions = [gsPos, satPos];
          entitiesRef.current.rfBeam.show = true;
        }
      }
    } else if (entitiesRef.current.rfBeam) {
      entitiesRef.current.rfBeam.show = false;
    }
  }, [satLat, satLon, satAltKm, comms, ready]);

  // ── Orbit ribbon & ground track ─────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium || viewer.isDestroyed() || !ready || groundTrackPoints.length === 0) return;

    const groundCoords: number[] = [];
    const orbitCoords: number[] = [];
    groundTrackPoints.forEach((pt) => {
      groundCoords.push(pt.longitude_deg, pt.latitude_deg);
      orbitCoords.push(pt.longitude_deg, pt.latitude_deg, (pt.altitude_km ?? satAltKm) * 1000);
    });

    if (!entitiesRef.current.groundTrack) {
      entitiesRef.current.groundTrack = viewer.entities.add({
        name: "Ground Track",
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(groundCoords),
          width: 2,
          material: Cesium.Color.fromCssColorString("#38bdf8").withAlpha(0.55),
          clampToGround: true,
        },
      });
    } else {
      entitiesRef.current.groundTrack.polyline.positions =
        Cesium.Cartesian3.fromDegreesArray(groundCoords);
    }

    if (!entitiesRef.current.orbitLine) {
      entitiesRef.current.orbitLine = viewer.entities.add({
        name: "Orbit Ribbon",
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(orbitCoords),
          width: 8,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.3,
            color: Cesium.Color.fromCssColorString("#60a5fa").withAlpha(0.8),
          }),
        },
      });
    } else {
      entitiesRef.current.orbitLine.polyline.positions =
        Cesium.Cartesian3.fromDegreesArrayHeights(orbitCoords);
    }
  }, [groundTrackPoints, satAltKm, ready]);

  // ── Clock sync ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium || !clock || viewer.isDestroyed()) return;
    viewer.clock.multiplier = clock.speed_multiplier;
    viewer.clock.shouldAnimate = clock.status === "RUNNING";
    const baseEpoch = Cesium.JulianDate.fromIso8601("2026-03-20T12:00:00Z");
    viewer.clock.currentTime = Cesium.JulianDate.addSeconds(
      baseEpoch,
      clock.elapsed_seconds,
      new Cesium.JulianDate()
    );
  }, [clock]);

  // ── Camera mode switching ───────────────────────────────────────────────────
  const applyCamera = useCallback(
    (viewer: any, Cesium: any, mode: FlightCamera, sat: any, _satPos: any, _altKm: number) => {
      if (!viewer || viewer.isDestroyed()) return;
      try {
        if (mode === "cinematic") {
          viewer.trackedEntity = sat;
          // Chase framing: ship in the lower third, Earth filling the background
          viewer.camera.zoomTo(sat, new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-12), 90000));
        } else if (mode === "ridealong") {
          viewer.trackedEntity = sat;
          // Almost touching the ship, looking past it down at Earth
          viewer.camera.zoomTo(sat, new Cesium.HeadingPitchRange(Cesium.Math.toRadians(160), Cesium.Math.toRadians(-35), 350));
        } else {
          viewer.trackedEntity = undefined;
          viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
        }
      } catch {
        /* camera ops race with tracking — safe to ignore */
      }
    },
    []
  );

  // Apply the camera framing when the viewer becomes ready or the mode changes
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium || viewer.isDestroyed() || !ready) return;
    const sat = entitiesRef.current.satellite;
    const pos = sat?.position?.getValue(viewer.clock.currentTime);
    applyCamera(viewer, Cesium, cameraMode, sat, pos, satAltKm);
  }, [ready, cameraMode, applyCamera, satAltKm]);

  const handleCameraChange = useCallback((mode: FlightCamera) => {
    setCameraMode(mode);
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium || viewer.isDestroyed()) return;
    if (mode === "free") {
      viewer.trackedEntity = undefined;
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    } else {
      const sat = entitiesRef.current.satellite;
      if (sat) applyCamera(viewer, Cesium, mode, sat, sat.position?.getValue(viewer.clock.currentTime), satAltKm);
    }
  }, [applyCamera, satAltKm]);

  // ── 2D accessible fallback ──────────────────────────────────────────────────
  if (useFallback || failed) {
    return (
      <div className={`relative w-full h-full bg-void ${className}`}>
        {webGLSupported && !failed && (
          <div className="absolute top-3 right-3 z-10">
            <span className="bg-void/80 border border-edge px-3 py-1 rounded-full text-xs text-muted">
              3D view unavailable — showing 2D map
            </span>
          </div>
        )}
        <AccessibleMissionMap
          orbital={orbital}
          comms={comms}
          scenarioId={scenarioId}
          groundTrackPoints={groundTrackPoints}
        />
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full overflow-hidden bg-void ${className}`}>
      <div ref={containerRef} className="w-full h-full" />

      {/* Camera switcher — big friendly pills */}
      <div className="absolute top-3 right-3 flex items-center gap-1 bg-void/80 backdrop-blur-md p-1 rounded-full border border-edge shadow-md pointer-events-auto">
        {(
          [
            ["cinematic", "🎥 Cinematic"],
            ["ridealong", "🛰️ Ride-along"],
            ["free", "🖐️ Free"],
          ] as Array<[FlightCamera, string]>
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => handleCameraChange(mode)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
              cameraMode === mode ? "bg-accent text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Status chips */}
      <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2 pointer-events-none">
        {imagerySource === "online" && (
          <span className="bg-void/80 backdrop-blur-md border border-edge px-3 py-1 rounded-full text-xs text-info shadow-md">
            🌍 Real satellite photos
          </span>
        )}
        {imagerySource === "offline" && (
          <span className="bg-void/80 backdrop-blur-md border border-edge px-3 py-1 rounded-full text-xs text-muted shadow-md">
            🌍 Offline Earth
          </span>
        )}
        <span
          className={`px-3 py-1 rounded-full text-xs border backdrop-blur-md shadow-md ${
            inEclipse
              ? "bg-indigo-950/80 border-indigo-500/30 text-indigo-300"
              : "bg-warn/10 border-warn/30 text-warn"
          }`}
        >
          {inEclipse ? "🌙 Night (no sunshine)" : "☀️ Daytime"}
        </span>
        {comms?.in_contact && (
          <span className="bg-void/80 backdrop-blur-md border border-info/40 px-3 py-1 rounded-full text-xs text-info shadow-md animate-pulse">
            📡 Talking to Earth!
          </span>
        )}
      </div>

      {/* Loading overlay */}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-void/70 z-10 pointer-events-none">
          <div className="text-center">
            <div className="text-3xl mb-2 animate-bounce">🛰️</div>
            <div className="text-sm text-muted">Preparing your spaceship…</div>
          </div>
        </div>
      )}
    </div>
  );
}
