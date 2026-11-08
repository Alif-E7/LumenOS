/**
 * Ground Station and Scenario Target constants for 3D Cesium & 2D Accessible Mission View.
 * Matches backend simulation/physics/comms.py and missions/*.yaml definitions.
 */

export interface GroundStationCoord {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  altitudeMeters: number;
  minElevationDeg: number;
  maxDataRateMbps: number;
}

export interface ScenarioTargetCoord {
  id: string;
  name: string;
  scenarioId: string;
  latitude: number;
  longitude: number;
  targetType: string;
  priority: number;
  description: string;
  colorHex: string;
  icon: string;
}

/** Global ground station network (polar + mid-latitude + equatorial). */
export const GROUND_STATIONS: GroundStationCoord[] = [
  {
    id: "svalbard",
    name: "Svalbard Satellite Station (SvalSat)",
    latitude: 78.23,
    longitude: 15.39,
    altitudeMeters: 450,
    minElevationDeg: 5.0,
    maxDataRateMbps: 25.0,
  },
  {
    id: "fairbanks",
    name: "Fairbanks Ground Station (NOAA/NASA)",
    latitude: 64.86,
    longitude: -147.72,
    altitudeMeters: 180,
    minElevationDeg: 5.0,
    maxDataRateMbps: 20.0,
  },
  {
    id: "wallops",
    name: "Wallops Flight Facility",
    latitude: 37.94,
    longitude: -75.46,
    altitudeMeters: 10,
    minElevationDeg: 5.0,
    maxDataRateMbps: 15.0,
  },
  {
    id: "canberra",
    name: "Canberra Deep Space Comms Complex",
    latitude: -35.40,
    longitude: 148.98,
    altitudeMeters: 650,
    minElevationDeg: 5.0,
    maxDataRateMbps: 15.0,
  },
  {
    id: "mcmurdo",
    name: "McMurdo Ground Station (Antarctica)",
    latitude: -77.85,
    longitude: 166.67,
    altitudeMeters: 30,
    minElevationDeg: 5.0,
    maxDataRateMbps: 20.0,
  },
  {
    id: "kourou",
    name: "Kourou Downrange Tracking Station",
    latitude: 5.25,
    longitude: -52.81,
    altitudeMeters: 25,
    minElevationDeg: 5.0,
    maxDataRateMbps: 15.0,
  },
];

/** Scenario targets defined across the 4 data-driven scenario families. */
export const SCENARIO_TARGETS: ScenarioTargetCoord[] = [
  // Wildfire Scout targets
  {
    id: "fire_zone_alpha",
    name: "Fire Zone Alpha (Blue Mountains)",
    scenarioId: "wildfire",
    latitude: -33.7,
    longitude: 150.3,
    targetType: "wildfire_front",
    priority: 1,
    description: "Active wildfire front, FRP 850 MW, 45% smoke obscuration",
    colorHex: "#ef4444",
    icon: "🔥",
  },
  {
    id: "fire_zone_bravo",
    name: "Fire Zone Bravo (Gippsland Ridge)",
    scenarioId: "wildfire",
    latitude: -37.5,
    longitude: 147.2,
    targetType: "wildfire_front",
    priority: 2,
    description: "Rapidly spreading ridge line fire, FRP 620 MW",
    colorHex: "#f97316",
    icon: "🔥",
  },
  {
    id: "fire_zone_charlie",
    name: "Fire Zone Charlie (Hunter Valley)",
    scenarioId: "wildfire",
    latitude: -32.8,
    longitude: 151.2,
    targetType: "ember_flank",
    priority: 3,
    description: "Emerging ember spotting flank, FRP 340 MW",
    colorHex: "#eab308",
    icon: "⚠️",
  },

  // Flood Scout targets
  {
    id: "flood_basin_alpha",
    name: "Brahmaputra Flood Plain (Assam Basin)",
    scenarioId: "flood",
    latitude: 26.1,
    longitude: 91.7,
    targetType: "riverine_inundation",
    priority: 1,
    description: "Riverine flood extent 14,500 km², 95% cloud cover (SAR required)",
    colorHex: "#06b6d4",
    icon: "🌊",
  },
  {
    id: "flood_basin_bravo",
    name: "Ganges Delta Confluence (Padma Region)",
    scenarioId: "flood",
    latitude: 23.4,
    longitude: 90.2,
    targetType: "estuarine_surge",
    priority: 1,
    description: "Estuarine storm surge flooding 21,000 km²",
    colorHex: "#3b82f6",
    icon: "🌊",
  },
  {
    id: "flood_basin_charlie",
    name: "Mahanadi Basin Outflow",
    scenarioId: "flood",
    latitude: 20.3,
    longitude: 85.8,
    targetType: "coastal_lagoon",
    priority: 2,
    description: "Coastal lagoon backwater inundation 6,200 km²",
    colorHex: "#60a5fa",
    icon: "🌊",
  },

  // Volcano Watch targets
  {
    id: "volcano_merapi",
    name: "Mount Merapi Caldera (Central Java)",
    scenarioId: "volcano",
    latitude: -7.54,
    longitude: 110.44,
    targetType: "active_stratovolcano",
    priority: 1,
    description: "Active stratovolcano, thermal hotspot 420 MW, SO2 plume 14 km",
    colorHex: "#dc2626",
    icon: "🌋",
  },
  {
    id: "volcano_krakatoa",
    name: "Anak Krakatau (Sunda Strait)",
    scenarioId: "volcano",
    latitude: -6.10,
    longitude: 105.42,
    targetType: "island_caldera",
    priority: 1,
    description: "Island caldera eruption, thermal hotspot 680 MW, SO2 plume 18 km",
    colorHex: "#b91c1c",
    icon: "🌋",
  },
  {
    id: "volcano_iceland",
    name: "Fagradalsfjall Rift Caldera (Reykjanes)",
    scenarioId: "volcano",
    latitude: 63.89,
    longitude: -22.27,
    targetType: "fissure_eruption",
    priority: 2,
    description: "Basaltic fissure eruption and lava fountain",
    colorHex: "#f87171",
    icon: "🌋",
  },

  // Solar Storm Sentinel targets
  {
    id: "solar_polar_station",
    name: "Svalbard Auroral Observatory (Longyearbyen)",
    scenarioId: "solar_storm",
    latitude: 78.2,
    longitude: 15.4,
    targetType: "polar_cusp_ground_station",
    priority: 1,
    description: "Polar magnetic cusp monitoring station (Geomag Lat 75.4°N)",
    colorHex: "#a855f7",
    icon: "⚡",
  },
  {
    id: "solar_antarctic_station",
    name: "McMurdo Polar Earth Station (Ross Island)",
    scenarioId: "solar_storm",
    latitude: -77.8,
    longitude: 166.7,
    targetType: "antarctic_geomagnetic_station",
    priority: 2,
    description: "Antarctic geomagnetic and solar proton flux station",
    colorHex: "#c084fc",
    icon: "⚡",
  },
];

/**
 * Great-circle distance between two lat/lon pairs in kilometers (Haversine formula).
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371.0; // Earth mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180.0;
  const dLon = ((lon2 - lon1) * Math.PI) / 180.0;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180.0) *
      Math.cos((lat2 * Math.PI) / 180.0) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates sensor observation footprint ground radius in kilometers.
 * @param altitudeKm Satellite altitude in km
 * @param fovDeg Sensor field of view full angle in degrees (default 30°)
 */
export function calculateFootprintRadiusKm(altitudeKm: number, fovDeg = 30.0): number {
  const halfFovRad = ((fovDeg / 2.0) * Math.PI) / 180.0;
  return altitudeKm * Math.tan(halfFovRad);
}

/**
 * Elevation angle in degrees from ground station to satellite.
 */
export function calculateElevationAngleDeg(
  stationLat: number,
  stationLon: number,
  satLat: number,
  satLon: number,
  satAltKm: number
): number {
  const dKm = haversineDistanceKm(stationLat, stationLon, satLat, satLon);
  const rE = 6371.0;
  const thetaRad = dKm / rE;
  const sinTheta = Math.sin(thetaRad);
  if (sinTheta === 0) return 90.0;
  const cosTheta = Math.cos(thetaRad);
  const num = cosTheta - rE / (rE + satAltKm);
  const elRad = Math.atan2(num, sinTheta);
  const elDeg = (elRad * 180.0) / Math.PI;
  return Math.max(-90.0, Math.min(90.0, elDeg));
}
