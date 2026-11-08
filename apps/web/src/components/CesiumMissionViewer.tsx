import { useEffect, useRef, useState, useCallback } from "react";
import type { OrbitalTelemetry, CommsTelemetry, ClockState } from "../types";
import { AccessibleMissionMap } from "./AccessibleMissionMap";
import {
  GROUND_STATIONS,
  SCENARIO_TARGETS,
  calculateFootprintRadiusKm,
} from "../lib/mission-geometry";

export interface CesiumMissionViewerProps {
  orbital?: OrbitalTelemetry | null;
  comms?: CommsTelemetry | null;
  clock?: ClockState | null;
  scenarioId?: string;
  groundTrackPoints?: Array<{ latitude_deg: number; longitude_deg: number; altitude_km?: number }>;
  className?: string;
  forceFallback?: boolean;
}

type CameraMode = "follow" | "nadir" | "free";

/**
 * Check if WebGL is available in the current browser/execution environment.
 */
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

/**
 * Primary 3D Mission View using CesiumJS.
 * Displays Earth, satellite entity, orbit trajectory, ground track, sensor footprint,
 * ground stations with 5° elevation cones, scenario targets, and active RF link beam.
 * Synchronizes with the authoritative simulation clock and provides clean non-Cesium fallback.
 */
export function CesiumMissionViewer({
  orbital,
  comms,
  clock,
  scenarioId,
  groundTrackPoints = [],
  className = "",
  forceFallback = false,
}: CesiumMissionViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<any>(null);
  const cesiumRef = useRef<any>(null);
  const entitiesRef = useRef<{
    satellite?: any;
    orbitPolyline?: any;
    groundTrack?: any;
    footprint?: any;
    rfBeam?: any;
    stations: Map<string, any>;
    targets: Map<string, any>;
  }>({
    stations: new Map(),
    targets: new Map(),
  });

  const [webGLSupported] = useState<boolean>(() => isWebGLAvailable());
  const [useFallback, setUseFallback] = useState<boolean>(forceFallback || !isWebGLAvailable());
  const [cameraMode, setCameraMode] = useState<CameraMode>("follow");

  const satLat = orbital?.latitude_deg ?? 0.0;
  const satLon = orbital?.longitude_deg ?? 0.0;
  const satAltKm = orbital?.altitude_km ?? 550.0;
  const inEclipse = orbital?.in_eclipse ?? false;

  // ── Initialize CesiumJS Viewer ──────────────────────────────────────────────
  useEffect(() => {
    if (useFallback || !webGLSupported || viewerRef.current || !containerRef.current) {
      return;
    }

    let isMounted = true;

    async function initCesium() {
      try {
        // Dynamically import Cesium to ensure zero execution in non-browser/non-WebGL environments
        const Cesium = await import("cesium");
        if (!isMounted || !containerRef.current) return;

        cesiumRef.current = Cesium;

        // Disable ion default token requirement and configure offline asset path
        Cesium.Ion.defaultAccessToken = "";

        // Minimalist mission control 3D viewer configuration
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

        // Configure offline NaturalEarthII imagery layer
        try {
          const provider = await Cesium.TileMapServiceImageryProvider.fromUrl(
            Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII")
 );
          viewer.imageryLayers.addImageryProvider(provider);
        } catch {
          // If offline NaturalEarthII texture fails, Cesium renders the default WGS84 ellipsoid
        }

        // Atmosphere and lighting styling
        viewer.scene.globe.enableLighting = true;
        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#090d16");

        // ── Add Ground Stations ───────────────────────────────────────────────
        GROUND_STATIONS.forEach((gs) => {
          const stationPos = Cesium.Cartesian3.fromDegrees(
            gs.longitude,
            gs.latitude,
            gs.altitudeMeters
 );

          // Station Point & Label
          const stationEntity = viewer.entities.add({
            name: gs.name,
            position: stationPos,
            point: {
              pixelSize: 6,
              color: Cesium.Color.fromCssColorString("#10b981"),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 1,
            },
            label: {
              text: gs.name.split(" ")[0],
              font: "10px monospace",
              fillColor: Cesium.Color.fromCssColorString("#94a3b8"),
              pixelOffset: new Cesium.Cartesian2(0, -12),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });

          // 5-degree elevation visibility footprint on ground
          const coverageRadiusMeters = 1400000; // ~1400 km visibility cone at LEO
          viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(gs.longitude, gs.latitude, 0),
            ellipse: {
              semiMajorAxis: coverageRadiusMeters,
              semiMinorAxis: coverageRadiusMeters,
              material: Cesium.Color.fromCssColorString("#10b981").withAlpha(0.04),
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString("#10b981").withAlpha(0.25),
              outlineWidth: 1,
            },
          });

          entitiesRef.current.stations.set(gs.id, stationEntity);
        });

        // ── Add Scenario Targets ──────────────────────────────────────────────
        const targetsToRender = scenarioId
          ? SCENARIO_TARGETS.filter((t) => t.scenarioId === scenarioId)
          : SCENARIO_TARGETS;

        targetsToRender.forEach((tgt) => {
          const targetPos = Cesium.Cartesian3.fromDegrees(tgt.longitude, tgt.latitude, 0);
          const targetEntity = viewer.entities.add({
            name: tgt.name,
            position: targetPos,
            point: {
              pixelSize: 8,
              color: Cesium.Color.fromCssColorString(tgt.colorHex),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 1.5,
            },
            label: {
              text: `${tgt.icon} ${tgt.name.split(" ")[0]}`,
              font: "10px sans-serif",
              fillColor: Cesium.Color.WHITE,
              pixelOffset: new Cesium.Cartesian2(0, 14),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
          entitiesRef.current.targets.set(tgt.id, targetEntity);
        });

        // ── Add Satellite Entity ──────────────────────────────────────────────
        const initialSatPos = Cesium.Cartesian3.fromDegrees(satLon, satLat, satAltKm * 1000);
        const satEntity = viewer.entities.add({
          name: "LUMEN-1 Spacecraft",
          position: initialSatPos,
          point: {
            pixelSize: 10,
            color: Cesium.Color.fromCssColorString("#38bdf8"),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
          },
          label: {
            text: "LUMEN-1",
            font: "11px monospace",
            fillColor: Cesium.Color.fromCssColorString("#67e8f9"),
            pixelOffset: new Cesium.Cartesian2(0, -18),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        entitiesRef.current.satellite = satEntity;

        // ── Add Sensor Observation Footprint ──────────────────────────────────
        const footprintRadiusMeters = calculateFootprintRadiusKm(satAltKm, 30.0) * 1000;
        const footprintEntity = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(satLon, satLat, 0),
          ellipse: {
            semiMajorAxis: footprintRadiusMeters,
            semiMinorAxis: footprintRadiusMeters,
            material: Cesium.Color.fromCssColorString("#38bdf8").withAlpha(0.15),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString("#38bdf8").withAlpha(0.8),
            outlineWidth: 2,
          },
        });
        entitiesRef.current.footprint = footprintEntity;
      } catch {
        setUseFallback(true);
      }
    }

    void initCesium();

    return () => {
      isMounted = false;
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
        cesiumRef.current = null;
      }
    };
  }, [useFallback, webGLSupported, scenarioId]);

  // ── Update Satellite, Footprint & Link Positions ────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium || viewer.isDestroyed()) return;

    const satPos = Cesium.Cartesian3.fromDegrees(satLon, satLat, satAltKm * 1000);
    const subSatGroundPos = Cesium.Cartesian3.fromDegrees(satLon, satLat, 0);

    // Update satellite position
    if (entitiesRef.current.satellite) {
      entitiesRef.current.satellite.position = satPos;
    }

    // Update footprint position & radius
    if (entitiesRef.current.footprint) {
      entitiesRef.current.footprint.position = subSatGroundPos;
      const radiusMeters = calculateFootprintRadiusKm(satAltKm, 30.0) * 1000;
      entitiesRef.current.footprint.ellipse.semiMajorAxis = radiusMeters;
      entitiesRef.current.footprint.ellipse.semiMinorAxis = radiusMeters;
    }

    // Update active RF comms downlink beam
    if (comms?.in_contact && comms.active_station) {
      const activeGs = GROUND_STATIONS.find((gs) =>
        comms.active_station?.toLowerCase().includes(gs.id)
 );
      if (activeGs) {
        const gsPos = Cesium.Cartesian3.fromDegrees(
          activeGs.longitude,
          activeGs.latitude,
          activeGs.altitudeMeters
 );
        if (!entitiesRef.current.rfBeam) {
          entitiesRef.current.rfBeam = viewer.entities.add({
            name: "Active RF Downlink Beam",
            polyline: {
              positions: [gsPos, satPos],
              width: 3,
              material: Cesium.Color.fromCssColorString("#22d3ee"),
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

    // Camera Mode Updates
    if (cameraMode === "follow") {
      viewer.trackedEntity = entitiesRef.current.satellite;
    } else if (cameraMode === "nadir") {
      viewer.trackedEntity = undefined;
      viewer.camera.lookAt(
        subSatGroundPos,
        new Cesium.HeadingPitchRange(0, -Cesium.Math.PI_OVER_TWO, (satAltKm + 400) * 1000)
 );
    } else {
      viewer.trackedEntity = undefined;
    }
  }, [satLat, satLon, satAltKm, comms, cameraMode]);

  // ── Update Orbit & Ground Track Polylines ───────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium || viewer.isDestroyed() || groundTrackPoints.length === 0) return;

    // Ground Track on Earth Surface
    const groundCoords: number[] = [];
    // 3D Orbit Trajectory in Space
    const orbitCoords: number[] = [];

    groundTrackPoints.forEach((pt) => {
      groundCoords.push(pt.longitude_deg, pt.latitude_deg);
      orbitCoords.push(
        pt.longitude_deg,
        pt.latitude_deg,
        (pt.altitude_km ?? satAltKm) * 1000
 );
    });

    // Update or create Ground Track polyline
    if (!entitiesRef.current.groundTrack) {
      entitiesRef.current.groundTrack = viewer.entities.add({
        name: "Ground Track",
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(groundCoords),
          width: 2,
          material: Cesium.Color.fromCssColorString("#38bdf8").withAlpha(0.7),
          clampToGround: true,
        },
      });
    } else {
      entitiesRef.current.groundTrack.polyline.positions =
        Cesium.Cartesian3.fromDegreesArray(groundCoords);
    }

    // Update or create 3D Orbit polyline
    if (!entitiesRef.current.orbitPolyline) {
      entitiesRef.current.orbitPolyline = viewer.entities.add({
        name: "Orbit Trajectory",
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(orbitCoords),
          width: 1.5,
          material: Cesium.Color.fromCssColorString("#60a5fa").withAlpha(0.6),
        },
      });
    } else {
      entitiesRef.current.orbitPolyline.polyline.positions =
        Cesium.Cartesian3.fromDegreesArrayHeights(orbitCoords);
    }
  }, [groundTrackPoints, satAltKm]);

  // ── Synchronize Cesium Clock with Simulation Clock ──────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium || !clock || viewer.isDestroyed()) return;

    viewer.clock.multiplier = clock.speed_multiplier;
    viewer.clock.shouldAnimate = clock.status === "RUNNING";

    // Set Julian date to baseline epoch + elapsed seconds
    const baseEpoch = Cesium.JulianDate.fromIso8601("2026-03-20T12:00:00Z");
    const simTime = Cesium.JulianDate.addSeconds(baseEpoch, clock.elapsed_seconds, new Cesium.JulianDate());
    viewer.clock.currentTime = simTime;
  }, [clock]);

  // Handle Camera switch
  const handleCameraChange = useCallback((mode: CameraMode) => {
    setCameraMode(mode);
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    if (mode === "free") {
      viewer.trackedEntity = undefined;
      viewer.camera.lookAtTransform(cesiumRef.current.Matrix4.IDENTITY);
    }
  }, []);

  // ── Render 2D Accessible Fallback if WebGL/Cesium disabled ──────────────────
  if (useFallback || !webGLSupported) {
    return (
 <div className={`space-y-2 ${className}`}>
        {webGLSupported && !forceFallback && (
 <div className="flex justify-end">
 <button
              type="button"
              onClick={() => setUseFallback(false)}
              className="text-xs font-mono text-info hover:text-info underline"
 >
              Switch to 3D Cesium View
 </button>
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
 <div
      className={`relative w-full rounded-none overflow-hidden border border-edge bg-void ${className}`}
      style={{ height: "480px" }}
 >
      {/* 3D WebGL Canvas Container */}
 <div ref={containerRef} className="w-full h-full" />

      {/* Mission Control HUD Overlay */}
 <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2 pointer-events-auto">
 <span className="bg-void/80 backdrop-blur-md border border-edge px-3 py-1 rounded-full text-xs font-mono text-info flex items-center gap-1.5 shadow-md">
 <span className="w-2 h-2 rounded-full bg-info animate-pulse" />
 <span>CESIUM 3D ORBIT VIEW</span>
 </span>
 <span
          className={`px-2.5 py-1 rounded-full text-xs font-mono border backdrop-blur-md ${
            inEclipse
              ? "bg-indigo-950/80 border-indigo-500/30 text-indigo-300"
              : "bg-warn/10 border-warn/30 text-warn"
          }`}
 >
          {inEclipse ? "🌑 Umbra (Eclipse)" : " Sunlit"}
 </span>
 </div>

      {/* Camera Mode Toolbar */}
 <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-void/80 backdrop-blur-md p-1 rounded-none border border-edge shadow-md pointer-events-auto">
 <button
          type="button"
          onClick={() => handleCameraChange("follow")}
          className={`px-2 py-1 text-xs font-mono rounded-none transition-colors ${
            cameraMode === "follow"
              ? "bg-accent text-ink font-bold"
              : "text-muted hover:text-ink"
          }`}
          title="Lock camera to spacecraft in orbital frame"
 >
          Track Sat
 </button>
 <button
          type="button"
          onClick={() => handleCameraChange("nadir")}
          className={`px-2 py-1 text-xs font-mono rounded-none transition-colors ${
            cameraMode === "nadir"
              ? "bg-accent text-ink font-bold"
              : "text-muted hover:text-ink"
          }`}
          title="Direct top-down view of nadir ground swath"
 >
          Nadir
 </button>
 <button
          type="button"
          onClick={() => handleCameraChange("free")}
          className={`px-2 py-1 text-xs font-mono rounded-none transition-colors ${
            cameraMode === "free"
              ? "bg-accent text-ink font-bold"
              : "text-muted hover:text-ink"
          }`}
          title="Free interactive 3D camera"
 >
          Free 3D
 </button>
 <div className="h-4 w-px bg-raised mx-0.5" />
 <button
          type="button"
          onClick={() => setUseFallback(true)}
          className="px-2 py-1 text-xs font-mono text-info hover:text-info hover:bg-panel rounded-none"
          title="Switch to high-contrast 2D accessible map"
 >
          2D Map
 </button>
 </div>

      {/* Bottom Coordinates & Comms HUD Bar */}
 <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 bg-void/85 backdrop-blur-md px-4 py-2 rounded-none border border-edge/80 text-xs font-mono pointer-events-auto shadow-lg">
 <div className="flex items-center gap-4 text-ink">
 <span>
            LAT: <strong className="text-ink">{satLat.toFixed(2)}°</strong>
 </span>
 <span>
            LON: <strong className="text-ink">{satLon.toFixed(2)}°</strong>
 </span>
 <span>
            ALT: <strong className="text-ink">{satAltKm.toFixed(1)} km</strong>
 </span>
 <span>
            VEL: <strong className="text-ink">{(orbital?.velocity_km_s ?? 7.6).toFixed(2)} km/s</strong>
 </span>
 </div>
 <div className="flex items-center gap-2">
          {comms?.in_contact ? (
 <span className="flex items-center gap-1.5 text-info">
 <span className="w-2 h-2 rounded-full bg-info animate-ping" />
 <span>RF LINK: {comms.active_station} ({comms.current_data_rate_mbps?.toFixed(1) ?? "0.0"} Mbps)</span>
 </span>
 ) : (
 <span className="text-faint">RF LINK: NO CONTACT</span>
 )}
 </div>
 </div>
 </div>
 );
}
