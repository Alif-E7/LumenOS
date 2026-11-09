import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { OrbitalTelemetry, CommsTelemetry, ClockState, ActiveEvent } from "../types";
import { AccessibleMissionMap } from "./AccessibleMissionMap";
import { resolveEarthImagery, type EarthImagerySource } from "../lib/earth-imagery";
import {
  GROUND_STATIONS,
  SCENARIO_TARGETS,
  calculateFootprintRadiusKm,
  haversineDistanceKm,
} from "../lib/mission-geometry";

export interface CesiumFlightViewProps {
  orbital?: OrbitalTelemetry | null;
  comms?: CommsTelemetry | null;
  clock?: ClockState | null;
  scenarioId?: string;
  groundTrackPoints?: Array<{ latitude_deg: number; longitude_deg: number; altitude_km?: number }>;
  activeEvent?: ActiveEvent | null;
  className?: string;
}

export type FlightCameraMode = "chase" | "ridealong" | "cinematic" | "nadir" | "free";

/**
 * Great-circle initial bearing between two lat/lon coordinates in radians.
 * 0 = North, π/2 = East, π = South, 3π/2 = West.
 */
function calculateBearingRad(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  return (theta + 2 * Math.PI) % (2 * Math.PI);
}

/**
 * Determine flight heading from ground track points or orbital coordinates.
 */
function determineFlightHeading(
  currentLat: number,
  currentLon: number,
  groundTrack: Array<{ latitude_deg: number; longitude_deg: number }>,
  prevLat?: number,
  prevLon?: number
): number {
  // If we have previous tick position and it moved meaningfully:
  if (prevLat !== undefined && prevLon !== undefined) {
    const d = Math.hypot(currentLat - prevLat, currentLon - prevLon);
    if (d > 0.005) {
      return calculateBearingRad(prevLat, prevLon, currentLat, currentLon);
    }
  }

  // Otherwise, use nearest ground track point and step forward:
  if (groundTrack.length >= 2) {
    let bestDist = Number.POSITIVE_INFINITY;
    let bestIdx = 0;
    for (let i = 0; i < groundTrack.length; i++) {
      const d = haversineDistanceKm(currentLat, currentLon, groundTrack[i].latitude_deg, groundTrack[i].longitude_deg);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const nextIdx = (bestIdx + 1) % groundTrack.length;
    const p1 = groundTrack[bestIdx];
    const p2 = groundTrack[nextIdx];
    return calculateBearingRad(p1.latitude_deg, p1.longitude_deg, p2.latitude_deg, p2.longitude_deg);
  }

  // Default standard prograde LEO heading ~65° (1.13 rad)
  return 1.134;
}

function targetEmoji(scenarioId: string): string {
  switch (scenarioId) {
    case "wildfire":
      return "🔥";
    case "flood":
      return "🌊";
    case "volcano":
      return "🌋";
    case "solar_storm":
      return "⚡";
    default:
      return "📍";
  }
}

/**
 * Cadet-mode fullscreen 3D ultra-realistic space flight simulator.
 *
 * Provides a genuine Third-Person Perspective (TPP) "driving the spaceship" view:
 * - 3D spacecraft model in the foreground, facing along its orbital flight vector.
 * - Earth rotating below with photo-realistic satellite imagery, atmospheric glow, and sunlight.
 * - Deep space with stars and the Sun shining in space.
 * - Realistic Earth events: burning wildfires, flooding river plains, erupting volcanoes, and auroras.
 * - In-range target detection when the spacecraft's sensor footprint covers an event.
 * - Active comms laser beam to ground stations.
 */
export function CesiumFlightView({
  orbital,
  comms,
  clock,
  scenarioId,
  groundTrackPoints = [],
  activeEvent,
  className = "",
}: CesiumFlightViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<any>(null);
  const cesiumRef = useRef<any>(null);
  const imagerySourceRef = useRef<EarthImagerySource>("none");
  const prevCoordsRef = useRef<{ lat: number; lon: number } | null>(null);

  const entitiesRef = useRef<{
    satellite?: any;
    orbitLine?: any;
    groundTrack?: any;
    footprint?: any;
    rfBeam?: any;
    activeEventBeacon?: any;
    stations: Map<string, any>;
    targets: Map<string, { beacon: any; disc: any; label: any; coord: any }>;
  }>({ stations: new Map(), targets: new Map() });

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [imagerySource, setImagerySource] = useState<EarthImagerySource>("none");
  const [cameraMode, setCameraMode] = useState<FlightCameraMode>("chase");
  const [inRangeTargetName, setInRangeTargetName] = useState<string | null>(null);

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

  // Filter scenario targets
  const scenarioTargets = useMemo(() => {
    return scenarioId
      ? SCENARIO_TARGETS.filter((t) => t.scenarioId === scenarioId)
      : SCENARIO_TARGETS;
  }, [scenarioId]);

  // Compute flight heading
  const flightHeading = useMemo(() => {
    const prev = prevCoordsRef.current;
    return determineFlightHeading(satLat, satLon, groundTrackPoints, prev?.lat, prev?.lon);
  }, [satLat, satLon, groundTrackPoints]);

  // ── Camera Positioning Engine ───────────────────────────────────────────────
  const applyCameraMode = useCallback(
    (viewer: any, Cesium: any, mode: FlightCameraMode, satPos: any, heading: number) => {
      if (!viewer || viewer.isDestroyed() || !satPos) return;

      try {
        const frame = Cesium.Transforms.eastNorthUpToFixedFrame(satPos);

        switch (mode) {
          case "chase": {
            // 🚀 TPP Driving Camera: directly behind the ship looking forward over the nose
            // Range: 45m behind, Pitch: -14° (looking slightly downward over the nose toward Earth's horizon)
            viewer.trackedEntity = undefined;
            viewer.camera.lookAtTransform(
              frame,
              new Cesium.HeadingPitchRange(heading, Cesium.Math.toRadians(-14), 48)
            );
            break;
          }
          case "ridealong": {
            // 🛰️ Wing Cam: mounted alongside the solar wing looking down at Earth
            viewer.trackedEntity = undefined;
            viewer.camera.lookAtTransform(
              frame,
              new Cesium.HeadingPitchRange(
                heading + Cesium.Math.toRadians(45),
                Cesium.Math.toRadians(-26),
                28
              )
            );
            break;
          }
          case "cinematic": {
            // 🎥 Cinematic Orbit: wider beauty angle showing ship & giant Earth sphere
            viewer.trackedEntity = undefined;
            viewer.camera.lookAtTransform(
              frame,
              new Cesium.HeadingPitchRange(
                heading + Cesium.Math.toRadians(120),
                Cesium.Math.toRadians(-18),
                190
              )
            );
            break;
          }
          case "nadir": {
            // 🌍 Earth Scan: looking straight down from the spaceship at the ground
            viewer.trackedEntity = undefined;
            viewer.camera.lookAtTransform(
              frame,
              new Cesium.HeadingPitchRange(heading, Cesium.Math.toRadians(-82), 120)
            );
            break;
          }
          case "free": {
            // 🖐️ Free: unlock camera for manual user exploration
            viewer.trackedEntity = undefined;
            viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
            break;
          }
        }
      } catch (err) {
        console.warn("Camera framing update notice:", err);
      }
    },
    []
  );

  // ── Initialize Cesium Viewer & Scene ─────────────────────────────────────────
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

        // 1. Earth Imagery: Sentinel-2 online satellite photos, NaturalEarthII offline fallback
        try {
          const imagery = await resolveEarthImagery(Cesium);
          if (imagery.provider) {
            try {
              viewer.imageryLayers.addImageryProvider(imagery.provider as any);
            } catch {
              try {
                viewer.imageryLayers.add(new Cesium.ImageryLayer(imagery.provider as any));
              } catch (e) {
                console.warn("Imagery layer attach notice:", e);
              }
            }
          }
          imagerySourceRef.current = imagery.source;
          if (isMounted) setImagerySource(imagery.source);
        } catch (err) {
          console.warn("Earth imagery resolution notice:", err);
        }

        // 2. Realistic Space Scene: Sun, stars, atmosphere, day/night lighting
        try {
          viewer.scene.globe.enableLighting = true;
          viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#060913");
          viewer.scene.globe.showGroundAtmosphere = true;
          if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;
          if (viewer.scene.skyBox) viewer.scene.skyBox.show = true;
          if (viewer.scene.sun) viewer.scene.sun.show = true;
          if (viewer.scene.moon) viewer.scene.moon.show = false;
        } catch (err) {
          console.warn("Scene environment notice:", err);
        }

        // 3. Ground Stations on Earth
        try {
          GROUND_STATIONS.forEach((gs) => {
            const stationPos = Cesium.Cartesian3.fromDegrees(gs.longitude, gs.latitude, gs.altitudeMeters);
            const stationEntity = viewer.entities.add({
              name: gs.name,
              position: stationPos,
              point: {
                pixelSize: 7,
                color: Cesium.Color.fromCssColorString("#10b981"),
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 1.5,
              },
              label: {
                text: `📡 ${gs.name.split(" ")[0]}`,
                font: "12px sans-serif",
                fillColor: Cesium.Color.fromCssColorString("#6ee7b7"),
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                pixelOffset: new Cesium.Cartesian2(0, -14),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
            });
            entitiesRef.current.stations.set(gs.id, stationEntity);
          });
        } catch (err) {
          console.warn("Ground station setup notice:", err);
        }

        // 4. Visible Earth Events & Targets (Wildfires, Floods, Volcanoes, Auroras)
        try {
          scenarioTargets.forEach((tgt) => {
            const groundPos = Cesium.Cartesian3.fromDegrees(tgt.longitude, tgt.latitude, 0);
            const beaconCenterPos = Cesium.Cartesian3.fromDegrees(tgt.longitude, tgt.latitude, 22000);
            const labelPos = Cesium.Cartesian3.fromDegrees(tgt.longitude, tgt.latitude, 46000);

            // 3D atmospheric event beacon pillar (visible from orbit!)
            const beacon = viewer.entities.add({
              name: `${tgt.name} Beacon`,
              position: beaconCenterPos,
              cylinder: {
                length: 44000,
                topRadius: 36000,
                bottomRadius: 14000,
                material: Cesium.Color.fromCssColorString(tgt.colorHex).withAlpha(0.32),
                outline: true,
                outlineColor: Cesium.Color.fromCssColorString(tgt.colorHex).withAlpha(0.7),
                outlineWidth: 1.5,
              },
            });

            // Pulsing ground danger perimeter
            const disc = viewer.entities.add({
              name: `${tgt.name} Danger Zone`,
              position: groundPos,
              ellipse: {
                semiMajorAxis: 75000,
                semiMinorAxis: 75000,
                material: Cesium.Color.fromCssColorString(tgt.colorHex).withAlpha(0.24),
                outline: true,
                outlineColor: Cesium.Color.fromCssColorString(tgt.colorHex).withAlpha(0.85),
                outlineWidth: 2.5,
              },
            });

            // Prominent 3D event badge
            const label = viewer.entities.add({
              name: `${tgt.name} Label`,
              position: labelPos,
              point: {
                pixelSize: 8,
                color: Cesium.Color.fromCssColorString(tgt.colorHex),
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2,
              },
              label: {
                text: `${targetEmoji(tgt.scenarioId)} ${tgt.name}`,
                font: "bold 13px sans-serif",
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 3,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                pixelOffset: new Cesium.Cartesian2(0, -18),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
            });

            entitiesRef.current.targets.set(tgt.id, { beacon, disc, label, coord: tgt });
          });
        } catch (err) {
          console.warn("Event targets setup notice:", err);
        }

        // 5. Lumen-1 Spacecraft: 3D glTF Model
        const initialPos = Cesium.Cartesian3.fromDegrees(satLon, satLat, satAltKm * 1000);
        try {
          const initialHpr = new Cesium.HeadingPitchRoll(flightHeading, 0, 0);
          const satEntity = viewer.entities.add({
            name: "LUMEN-1 Spacecraft",
            position: initialPos,
            orientation: Cesium.Transforms.headingPitchRollQuaternion(initialPos, initialHpr),
            model: {
              uri: "/models/lumen-satellite.glb",
              minimumPixelSize: 110,
              maximumScale: 50000,
              scale: 1.8,
              show: true,
              silhouetteColor: Cesium.Color.fromCssColorString("#38bdf8").withAlpha(0.5),
              silhouetteSize: 1.5,
            },
            label: {
              text: "LUMEN-1",
              font: "bold 13px sans-serif",
              fillColor: Cesium.Color.fromCssColorString("#67e8f9"),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2.5,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              pixelOffset: new Cesium.Cartesian2(0, -38),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
          entitiesRef.current.satellite = satEntity;
        } catch (err) {
          console.warn("Spacecraft model attach notice:", err);
        }

        // 6. Sensor Observation Footprint
        try {
          const footprintRadiusMeters = calculateFootprintRadiusKm(satAltKm, 30.0) * 1000;
          entitiesRef.current.footprint = viewer.entities.add({
            name: "Sensor Observation Cone",
            position: Cesium.Cartesian3.fromDegrees(satLon, satLat, 0),
            ellipse: {
              semiMajorAxis: footprintRadiusMeters,
              semiMinorAxis: footprintRadiusMeters,
              material: Cesium.Color.fromCssColorString("#38bdf8").withAlpha(0.16),
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString("#38bdf8").withAlpha(0.85),
              outlineWidth: 2,
            },
          });
        } catch (err) {
          console.warn("Sensor footprint setup notice:", err);
        }

        // Initial camera framing
        applyCameraMode(viewer, Cesium, "chase", initialPos, flightHeading);

        if (isMounted) setReady(true);
      } catch (err) {
        console.error("CesiumFlightView init failed:", err);
        if (isMounted) setFailed(true);
      }
    }

    void init();

    return () => {
      isMounted = false;
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        try {
          viewerRef.current.destroy();
        } catch {
          /* ignore */
        }
        viewerRef.current = null;
        cesiumRef.current = null;
      }
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useFallback, scenarioTargets]);

  // ── Per-tick updates: Spacecraft Pose, Footprint, RF Beam, Camera ───────────
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium || viewer.isDestroyed() || !ready) return;

    const satPos = Cesium.Cartesian3.fromDegrees(satLon, satLat, satAltKm * 1000);
    const subSatPos = Cesium.Cartesian3.fromDegrees(satLon, satLat, 0);
    const sat = entitiesRef.current.satellite;

    // 1. Update Spacecraft Position & Orientation (facing flight direction)
    if (sat) {
      sat.position = satPos;
      try {
        const hpr = new Cesium.HeadingPitchRoll(flightHeading, 0, 0);
        sat.orientation = Cesium.Transforms.headingPitchRollQuaternion(satPos, hpr);
      } catch {
        /* orientation is cosmetic */
      }
    }

    // 2. Update Sensor Footprint
    if (entitiesRef.current.footprint) {
      entitiesRef.current.footprint.position = subSatPos;
      const r = calculateFootprintRadiusKm(satAltKm, 30.0) * 1000;
      entitiesRef.current.footprint.ellipse.semiMajorAxis = r;
      entitiesRef.current.footprint.ellipse.semiMinorAxis = r;
    }

    // 3. Dynamic In-Range Target Detection
    const footprintRadiusKm = calculateFootprintRadiusKm(satAltKm, 30.0);
    let acquiredTarget: string | null = null;

    entitiesRef.current.targets.forEach(({ beacon, disc, label, coord }) => {
      const dKm = haversineDistanceKm(satLat, satLon, coord.latitude, coord.longitude);
      const inRange = dKm <= footprintRadiusKm;

      if (inRange) {
        acquiredTarget = coord.name;
        // Turn beacon & ground ring bright neon green
        if (disc?.ellipse) {
          disc.ellipse.material = Cesium.Color.fromCssColorString("#22c55e").withAlpha(0.45);
          disc.ellipse.outlineColor = Cesium.Color.fromCssColorString("#4ade80");
          disc.ellipse.outlineWidth = 3.5;
        }
        if (beacon?.cylinder) {
          beacon.cylinder.material = Cesium.Color.fromCssColorString("#22c55e").withAlpha(0.4);
        }
        if (label?.label) {
          label.label.text = `🎯 IN RANGE: ${coord.name.split(" ")[0]} — SNAP PHOTO!`;
          label.label.fillColor = Cesium.Color.fromCssColorString("#4ade80");
        }
      } else {
        // Normal color
        if (disc?.ellipse) {
          disc.ellipse.material = Cesium.Color.fromCssColorString(coord.colorHex).withAlpha(0.24);
          disc.ellipse.outlineColor = Cesium.Color.fromCssColorString(coord.colorHex).withAlpha(0.85);
          disc.ellipse.outlineWidth = 2.5;
        }
        if (beacon?.cylinder) {
          beacon.cylinder.material = Cesium.Color.fromCssColorString(coord.colorHex).withAlpha(0.32);
        }
        if (label?.label) {
          label.label.text = `${targetEmoji(coord.scenarioId)} ${coord.name}`;
          label.label.fillColor = Cesium.Color.WHITE;
        }
      }
    });

    setInRangeTargetName(acquiredTarget);

    // 4. RF Comms Beam to Active Ground Station
    if (comms?.in_contact && comms.active_station) {
      const gs = GROUND_STATIONS.find((s) =>
        comms.active_station?.toLowerCase().includes(s.id)
      );
      if (gs) {
        const gsPos = Cesium.Cartesian3.fromDegrees(gs.longitude, gs.latitude, gs.altitudeMeters);
        if (!entitiesRef.current.rfBeam) {
          entitiesRef.current.rfBeam = viewer.entities.add({
            name: "RF Comms Downlink",
            polyline: {
              positions: [gsPos, satPos],
              width: 5,
              material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.35,
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

    // 5. Active Game Event Beacon on Earth
    if (activeEvent && activeEvent.is_pending) {
      const eventPos = Cesium.Cartesian3.fromDegrees(satLon, satLat, 35000);
      if (!entitiesRef.current.activeEventBeacon) {
        entitiesRef.current.activeEventBeacon = viewer.entities.add({
          name: "Active Event Alert",
          position: eventPos,
          cylinder: {
            length: 70000,
            topRadius: 45000,
            bottomRadius: 20000,
            material: Cesium.Color.fromCssColorString("#f59e0b").withAlpha(0.38),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString("#fbbf24"),
            outlineWidth: 2,
          },
          label: {
            text: `⚠️ ALERT: ${activeEvent.name}`,
            font: "bold 14px sans-serif",
            fillColor: Cesium.Color.fromCssColorString("#fef08a"),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -32),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      } else {
        entitiesRef.current.activeEventBeacon.position = eventPos;
        entitiesRef.current.activeEventBeacon.label.text = `⚠️ ALERT: ${activeEvent.name}`;
        entitiesRef.current.activeEventBeacon.show = true;
      }
    } else if (entitiesRef.current.activeEventBeacon) {
      entitiesRef.current.activeEventBeacon.show = false;
    }

    // 6. Camera Follow: Keep camera locked to flight perspective
    if (cameraMode !== "free") {
      applyCameraMode(viewer, Cesium, cameraMode, satPos, flightHeading);
    }

    // Store coords for bearing computation on next tick
    prevCoordsRef.current = { lat: satLat, lon: satLon };
  }, [satLat, satLon, satAltKm, comms, activeEvent, flightHeading, cameraMode, ready, applyCameraMode]);

  // ── Orbit Trajectory Ribbon & Ground Track ──────────────────────────────────
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
          material: Cesium.Color.fromCssColorString("#38bdf8").withAlpha(0.6),
          clampToGround: true,
        },
      });
    } else {
      entitiesRef.current.groundTrack.polyline.positions =
        Cesium.Cartesian3.fromDegreesArray(groundCoords);
    }

    if (!entitiesRef.current.orbitLine) {
      entitiesRef.current.orbitLine = viewer.entities.add({
        name: "Orbit Trajectory",
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(orbitCoords),
          width: 6,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.28,
            color: Cesium.Color.fromCssColorString("#60a5fa").withAlpha(0.85),
          }),
        },
      });
    } else {
      entitiesRef.current.orbitLine.polyline.positions =
        Cesium.Cartesian3.fromDegreesArrayHeights(orbitCoords);
    }
  }, [groundTrackPoints, satAltKm, ready]);

  // ── Simulation Clock Sync ───────────────────────────────────────────────────
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

  // Handle camera switch
  const handleCameraChange = useCallback(
    (mode: FlightCameraMode) => {
      setCameraMode(mode);
      const viewer = viewerRef.current;
      const Cesium = cesiumRef.current;
      if (!viewer || !Cesium || viewer.isDestroyed()) return;

      const satPos = Cesium.Cartesian3.fromDegrees(satLon, satLat, satAltKm * 1000);
      applyCameraMode(viewer, Cesium, mode, satPos, flightHeading);
    },
    [satLon, satLat, satAltKm, flightHeading, applyCameraMode]
  );

  // ── Fallback to 2D Map ONLY if WebGL Hardware Missing ───────────────────────
  if (useFallback || failed) {
    return (
      <div className={`relative w-full h-full bg-void ${className}`}>
        <div className="absolute top-3 right-3 z-10">
          <span className="bg-void/80 border border-edge px-3 py-1 rounded-full text-xs text-muted shadow-md">
            2D Map Mode
          </span>
        </div>
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
      {/* 3D WebGL Canvas */}
      <div ref={containerRef} className="w-full h-full" />

      {/* ── Top-Right: Camera Mode Switcher ── */}
      <div className="absolute top-3 right-3 flex items-center gap-1 bg-void/85 backdrop-blur-md p-1 rounded-full border border-edge shadow-xl pointer-events-auto z-20">
        {(
          [
            ["chase", "🚀 Pilot (TPP)"],
            ["ridealong", "🛰️ Wing"],
            ["cinematic", "🎥 Cinematic"],
            ["nadir", "🌍 Down"],
            ["free", "🖐️ Free"],
          ] as Array<[FlightCameraMode, string]>
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => handleCameraChange(mode)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
              cameraMode === mode
                ? "bg-accent text-ink shadow-sm"
                : "text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
        {cameraMode !== "chase" && (
          <button
            type="button"
            onClick={() => handleCameraChange("chase")}
            title="Snap back to cockpit driving camera"
            className="px-2 py-1 text-xs text-amber-300 hover:text-amber-200 border-l border-edge ml-1 font-bold"
          >
            Reset
          </button>
        )}
      </div>

      {/* ── Top-Left: Flight Status Badges ── */}
      <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2 pointer-events-none z-20">
        {imagerySource === "online" && (
          <span className="bg-void/85 backdrop-blur-md border border-info/40 px-3 py-1 rounded-full text-xs text-info shadow-md flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-info animate-ping" />
            <span>🌍 Real satellite photos</span>
          </span>
        )}
        {imagerySource === "offline" && (
          <span className="bg-void/85 backdrop-blur-md border border-edge px-3 py-1 rounded-full text-xs text-muted shadow-md">
            🌍 Offline Earth
          </span>
        )}
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
            📡 Talking to {comms.active_station?.split(" ")[0]}!
          </span>
        )}
      </div>

      {/* ── Center Alert: Target Acquired in Sensor Range! ── */}
      {inRangeTargetName && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="bg-emerald-950/90 border border-emerald-400 px-5 py-2 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2.5 animate-bounce">
            <span className="text-base">📸</span>
            <span className="text-xs sm:text-sm font-bold text-emerald-200">
              TARGET OVERHEAD: {inRangeTargetName} — Take a photo!
            </span>
          </div>
        </div>
      )}

      {/* ── Loading Overlay ── */}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-void/80 z-30 pointer-events-none">
          <div className="text-center">
            <div className="text-4xl mb-3 animate-bounce">🛰️</div>
            <div className="text-sm font-bold text-ink">Entering orbit…</div>
            <div className="text-xs text-muted mt-1">Starting up 3D flight engines</div>
          </div>
        </div>
      )}
    </div>
  );
}
