import { useId, useMemo } from "react";
import type { OrbitalTelemetry, CommsTelemetry } from "../types";
import {
  GROUND_STATIONS,
  SCENARIO_TARGETS,
  calculateElevationAngleDeg,
  calculateFootprintRadiusKm,
  haversineDistanceKm,
} from "../lib/mission-geometry";

interface AccessibleMissionMapProps {
  orbital?: OrbitalTelemetry | null;
  comms?: CommsTelemetry | null;
  scenarioId?: string;
  groundTrackPoints?: Array<{ latitude_deg: number; longitude_deg: number; in_eclipse?: boolean }>;
  className?: string;
  onSelectTarget?: (targetId: string) => void;
  onSelectStation?: (stationId: string) => void;
}

/**
 * High-fidelity 2D Canvas/SVG Equirectangular Mission Map & Accessible Telemetry Data Table.
 * Provides accessible alternatives to map-only information, clear units/tooltips,
 * non-color-only warnings, keyboard-accessible controls, and works when WebGL or Cesium is unavailable.
 */
export function AccessibleMissionMap({
  orbital,
  comms,
  scenarioId,
  groundTrackPoints = [],
  className = "",
  onSelectTarget,
  onSelectStation,
}: AccessibleMissionMapProps) {
  const mapId = useId();

  const satLat = orbital?.latitude_deg ?? 0.0;
  const satLon = orbital?.longitude_deg ?? 0.0;
  const satAltKm = orbital?.altitude_km ?? 550.0;
  const satVelKmS = orbital?.velocity_km_s ?? 7.6;
  const inEclipse = orbital?.in_eclipse ?? false;

  const footprintRadiusKm = useMemo(
    () => calculateFootprintRadiusKm(satAltKm, 30.0),
    [satAltKm]
 );

  // Filter scenario targets
  const relevantTargets = useMemo(() => {
    if (!scenarioId) return SCENARIO_TARGETS.slice(0, 4);
    const filtered = SCENARIO_TARGETS.filter((t) => t.scenarioId === scenarioId);
    return filtered.length > 0 ? filtered : SCENARIO_TARGETS.slice(0, 4);
  }, [scenarioId]);

  // Map coordinates to SVG viewBox (width: 800, height: 400)
  // Lon: -180..+180 -> x: 0..800
  // Lat: +90..-90 -> y: 0..400
  const lonToX = (lon: number) => ((lon + 180) / 360) * 800;
  const latToY = (lat: number) => ((90 - lat) / 180) * 400;

  const satX = lonToX(satLon);
  const satY = latToY(satLat);

  // Ground track SVG path
  const groundTrackPath = useMemo(() => {
    if (groundTrackPoints.length === 0) return "";
    let path = "";
    for (let i = 0; i < groundTrackPoints.length; i++) {
      const pt = groundTrackPoints[i];
      const x = lonToX(pt.longitude_deg);
      const y = latToY(pt.latitude_deg);
      if (i === 0) {
        path += `M ${x.toFixed(1)} ${y.toFixed(1)}`;
      } else {
        // Discontinuity check across the antimeridian (-180 / +180)
        const prevPt = groundTrackPoints[i - 1];
        if (Math.abs(pt.longitude_deg - prevPt.longitude_deg) > 180) {
          path += ` M ${x.toFixed(1)} ${y.toFixed(1)}`;
        } else {
          path += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
        }
      }
    }
    return path;
  }, [groundTrackPoints]);

  // Target calculations
  const targetRows = useMemo(() => {
    return relevantTargets.map((target) => {
      const distKm = haversineDistanceKm(satLat, satLon, target.latitude, target.longitude);
      const inFootprint = distKm <= footprintRadiusKm;
      return {
        ...target,
        distanceKm: distKm,
        inFootprint,
      };
    });
  }, [relevantTargets, satLat, satLon, footprintRadiusKm]);

  // Ground station calculations
  const stationRows = useMemo(() => {
    return GROUND_STATIONS.map((gs) => {
      const distKm = haversineDistanceKm(satLat, satLon, gs.latitude, gs.longitude);
      const elevationDeg = calculateElevationAngleDeg(
        gs.latitude,
        gs.longitude,
        satLat,
        satLon,
        satAltKm
 );
      const isVisible = elevationDeg >= gs.minElevationDeg;
      const isContacting = comms?.in_contact && comms.active_station?.toLowerCase().includes(gs.id);
      return {
        ...gs,
        distanceKm: distKm,
        elevationDeg,
        isVisible,
        isContacting,
      };
    });
  }, [satLat, satLon, satAltKm, comms]);

  // Footprint SVG radius approximate (scaled to pixels)
  // 1 degree lat ≈ 111 km ≈ 2.22 px
  const footprintPx = Math.max(8, (footprintRadiusKm / 111) * 2.22);

  return (
 <div
      className={`rounded-none border border-edge bg-void/80 p-4 space-y-4 ${className}`}
      role="region"
      aria-label="2D Accessible Mission Map and Orbital Telemetry"
 >
      {/* Map Header */}
 <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge pb-3">
 <div className="flex items-center gap-2">
 <span className="text-xl" aria-hidden="true"></span>
 <div>
 <h3 className="text-sm font-semibold text-ink">2D Accessible Ground Track & Telemetry</h3>
 <p className="text-xs text-muted">
              Equirectangular projection (WGS-84) · Complete screen-reader accessible alternative
 </p>
 </div>
 </div>
 <div className="flex items-center gap-2">
 <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium border ${
              inEclipse
                ? "bg-indigo-950/60 border-indigo-500/30 text-indigo-300"
                : "bg-warn/10 border-warn/30 text-warn"
            }`}
 >
 <span aria-hidden="true">{inEclipse ? "🌑" : ""}</span>
 <span>{inEclipse ? "In Eclipse (Umbra)" : "Sunlit Orbit"}</span>
 </span>
 <span className="text-xs font-mono bg-panel border border-edge px-2.5 py-1 rounded-full text-info">
            Alt: {satAltKm.toFixed(1)} km · Vel: {satVelKmS.toFixed(2)} km/s
 </span>
 </div>
 </div>

      {/* SVG Map Canvas */}
 <div className="relative w-full aspect-[2/1] bg-panel/90 rounded-none overflow-hidden border border-edge/80 shadow-inner">
 <svg
          viewBox="0 0 800 400"
          className="w-full h-full select-none"
          role="img"
          aria-labelledby={`${mapId}-title`}
 >
 <title id={`${mapId}-title`}>
            World map ground track showing satellite at {satLat.toFixed(1)}° latitude, {satLon.toFixed(1)}° longitude
 </title>

          {/* Graticule / Gridlines */}
 <g stroke="#1e293b" strokeWidth="1" strokeDasharray="3,3" opacity="0.7">
            {/* Equator & Tropics */}
 <line x1="0" y1="200" x2="800" y2="200" stroke="#334155" strokeWidth="1.5" />
 <line x1="0" y1="148" x2="800" y2="148" /> {/* Tropic of Cancer 23.5°N */}
 <line x1="0" y1="252" x2="800" y2="252" /> {/* Tropic of Capricorn 23.5°S */}
 <line x1="0" y1="52" x2="800" y2="52" />   {/* Arctic Circle 66.5°N */}
 <line x1="0" y1="348" x2="800" y2="348" /> {/* Antarctic Circle 66.5°S */}

            {/* Meridians */}
 <line x1="400" y1="0" x2="400" y2="400" stroke="#334155" strokeWidth="1.5" /> {/* Prime Meridian 0° */}
 <line x1="200" y1="0" x2="200" y2="400" /> {/* 90° W */}
 <line x1="600" y1="0" x2="600" y2="400" /> {/* 90° E */}
 </g>

          {/* Simplified Continental Landmass Shapes */}
 <g fill="#0f172a" stroke="#1e293b" strokeWidth="1" opacity="0.6">
            {/* North America */}
 <path d="M 120 70 L 260 70 L 250 180 L 190 200 L 140 160 Z" />
            {/* South America */}
 <path d="M 230 205 L 300 240 L 270 340 L 240 330 Z" />
            {/* Eurasia */}
 <path d="M 370 70 L 720 70 L 680 180 L 520 180 L 400 130 Z" />
            {/* Africa */}
 <path d="M 380 150 L 480 160 L 470 280 L 420 290 L 380 210 Z" />
            {/* Australia */}
 <path d="M 650 250 L 730 260 L 710 320 L 640 300 Z" />
 </g>

          {/* Ground Track Trajectory */}
          {groundTrackPath && (
 <path
              d={groundTrackPath}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2"
              strokeDasharray="4,2"
              opacity="0.8"
            />
 )}

          {/* Ground Station Visibility Cones and Markers */}
          {stationRows.map((gs) => {
            const gx = lonToX(gs.longitude);
            const gy = latToY(gs.latitude);
            return (
 <g
                key={gs.id}
                className="cursor-pointer"
                onClick={() => onSelectStation?.(gs.id)}
                tabIndex={0}
                role="button"
                aria-label={`Ground Station ${gs.name}, elevation ${gs.elevationDeg.toFixed(1)} degrees`}
 >
                {/* 5-degree elevation coverage circle */}
 <circle
                  cx={gx}
                  cy={gy}
                  r="28"
                  fill="none"
                  stroke={gs.isContacting ? "#22d3ee" : gs.isVisible ? "#10b981" : "#475569"}
                  strokeWidth={gs.isContacting ? "2" : "1"}
                  strokeDasharray={gs.isContacting ? "none" : "2,2"}
                  opacity={gs.isVisible ? 0.7 : 0.3}
                />
                {/* Station dot */}
 <circle
                  cx={gx}
                  cy={gy}
                  r="4"
                  fill={gs.isContacting ? "#22d3ee" : gs.isVisible ? "#10b981" : "#64748b"}
                />
 <text
                  x={gx}
                  y={gy - 8}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="9"
                  fontFamily="monospace"
 >
                  {gs.name.split(" ")[0]}
 </text>
                {/* Active RF downlink beam when contacting */}
                {gs.isContacting && (
 <line
                    x1={gx}
                    y1={gy}
                    x2={satX}
                    y2={satY}
                    stroke="#22d3ee"
                    strokeWidth="2.5"
                    strokeDasharray="4,3"
                    className="animate-pulse"
                  />
 )}
 </g>
 );
          })}

          {/* Scenario Targets */}
          {targetRows.map((tgt) => {
            const tx = lonToX(tgt.longitude);
            const ty = latToY(tgt.latitude);
            return (
 <g
                key={tgt.id}
                className="cursor-pointer"
                onClick={() => onSelectTarget?.(tgt.id)}
                tabIndex={0}
                role="button"
                aria-label={`Target ${tgt.name}, distance ${tgt.distanceKm.toFixed(0)} km`}
 >
 <circle
                  cx={tx}
                  cy={ty}
                  r={tgt.inFootprint ? "9" : "5"}
                  fill={tgt.colorHex}
                  fillOpacity={tgt.inFootprint ? 0.8 : 0.5}
                  stroke="#ffffff"
                  strokeWidth={tgt.inFootprint ? "2" : "1"}
                />
 <text
                  x={tx}
                  y={ty + 13}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="8"
                  fontFamily="sans-serif"
 >
                  {tgt.name.split(" ")[0]}
 </text>
 </g>
 );
          })}

          {/* Observation Sensor Footprint Circle */}
 <circle
            cx={satX}
            cy={satY}
            r={footprintPx}
            fill="#38bdf8"
            fillOpacity="0.15"
            stroke="#38bdf8"
            strokeWidth="1.5"
          />

          {/* Satellite Entity Reticle */}
 <g>
 <circle cx={satX} cy={satY} r="7" fill="none" stroke="#60a5fa" strokeWidth="2" />
 <circle cx={satX} cy={satY} r="3" fill="#ffffff" />
 <line x1={satX - 10} y1={satY} x2={satX + 10} y2={satY} stroke="#60a5fa" strokeWidth="1.5" />
 <line x1={satX} y1={satY - 10} x2={satX} y2={satY + 10} stroke="#60a5fa" strokeWidth="1.5" />
 <text
              x={satX}
              y={satY - 12}
              textAnchor="middle"
              fill="#67e8f9"
              fontSize="10"
              fontWeight="bold"
              fontFamily="monospace"
 >
              LUMEN-1
 </text>
 </g>
 </svg>

        {/* Floating coordinates badge */}
 <div className="absolute bottom-2 left-2 bg-void/80 backdrop-blur-md px-2.5 py-1 rounded-none border border-edge text-[10px] font-mono text-ink">
          Sub-Sat: {satLat >= 0 ? `${satLat.toFixed(1)}°N` : `${Math.abs(satLat).toFixed(1)}°S`},{" "}
          {satLon >= 0 ? `${satLon.toFixed(1)}°E` : `${Math.abs(satLon).toFixed(1)}°W`}
 </div>
 </div>

      {/* Accessible Telemetry Tables */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Ground Station Contact Table */}
 <div className="rounded-none border border-edge bg-panel/50 p-3">
 <div className="flex items-center justify-between mb-2">
 <h4 className="text-xs font-semibold text-ink uppercase tracking-wider flex items-center gap-1.5">
 <span></span> Ground Station Network (RF Passes)
 </h4>
 <span className="text-[10px] font-mono text-muted">Elevation Mask: 5.0°</span>
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs font-mono">
 <caption className="sr-only">Ground Station Network Link and Elevation Status</caption>
 <thead>
 <tr className="border-b border-edge text-faint text-[10px] uppercase">
 <th className="py-1 px-1.5">Station</th>
 <th className="py-1 px-1.5">Elevation</th>
 <th className="py-1 px-1.5">Slant Range</th>
 <th className="py-1 px-1.5">Link State</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-edge/60 text-ink">
                {stationRows.map((gs) => (
 <tr
                    key={gs.id}
                    className={gs.isContacting ? "bg-info/10 font-semibold" : ""}
 >
 <td className="py-1.5 px-1.5 text-ink">{gs.name.split(" ")[0]}</td>
 <td className="py-1.5 px-1.5">
 <span className={gs.isVisible ? "text-ok font-bold" : "text-muted"}>
                        {gs.elevationDeg.toFixed(1)}°
 </span>
 </td>
 <td className="py-1.5 px-1.5">{gs.distanceKm.toFixed(0)} km</td>
 <td className="py-1.5 px-1.5">
                      {gs.isContacting ? (
 <span className="inline-block px-1.5 py-0.5 rounded-none text-[10px] bg-info/20 text-info border border-info/40">
                          LINK ACTIVE
 </span>
 ) : gs.isVisible ? (
 <span className="inline-block px-1.5 py-0.5 rounded-none text-[10px] bg-ok/20 text-ok border border-ok/40">
                          IN VIEW
 </span>
 ) : (
 <span className="text-faint text-[10px]">BELOW HORIZON</span>
 )}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>

        {/* Observation Opportunities Table */}
 <div className="rounded-none border border-edge bg-panel/50 p-3">
 <div className="flex items-center justify-between mb-2">
 <h4 className="text-xs font-semibold text-ink uppercase tracking-wider flex items-center gap-1.5">
 <span></span> Observation Targets & Swath Geometry
 </h4>
 <span className="text-[10px] font-mono text-info">
              Swath Radius: {footprintRadiusKm.toFixed(0)} km
 </span>
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs font-mono">
 <caption className="sr-only">Scenario Observation Targets and Nadir Swath Status</caption>
 <thead>
 <tr className="border-b border-edge text-faint text-[10px] uppercase">
 <th className="py-1 px-1.5">Target</th>
 <th className="py-1 px-1.5">Type</th>
 <th className="py-1 px-1.5">Slant Range</th>
 <th className="py-1 px-1.5">Window</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-edge/60 text-ink">
                {targetRows.map((tgt) => (
 <tr
                    key={tgt.id}
                    className={tgt.inFootprint ? "bg-warn/10 font-semibold" : ""}
 >
 <td className="py-1.5 px-1.5 text-ink flex items-center gap-1">
 <span aria-hidden="true">{tgt.icon}</span>
 <span>{tgt.name.split(" ")[0]}</span>
 </td>
 <td className="py-1.5 px-1.5 text-muted text-[11px]">{tgt.targetType}</td>
 <td className="py-1.5 px-1.5">{tgt.distanceKm.toFixed(0)} km</td>
 <td className="py-1.5 px-1.5">
                      {tgt.inFootprint ? (
 <span className="inline-block px-1.5 py-0.5 rounded-none text-[10px] bg-warn/20 text-warn border border-warn/40">
                          IN FOOTPRINT
 </span>
 ) : (
 <span className="text-faint text-[10px]">OUT OF SWATH</span>
 )}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 </div>
 </div>
 );
}
