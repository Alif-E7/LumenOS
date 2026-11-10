/**
 * Geographic Coordinate Conversion & Country Border Geometry Builder
 *
 * Converts authoritative Natural Earth GeoJSON / TopoJSON boundary datasets
 * into subdivided spherical Three.js LineSegments that hug the curvature of
 * the Earth without chord clipping or antimeridian artifacts.
 */

import * as THREE from "three";

export interface CountryFeature {
  name: string;
  isoA3?: string;
  labelLat?: number;
  labelLon?: number;
  labelRank?: number;
  /** Array of coordinate rings: each ring is an array of [lon, lat] pairs */
  polygons: Array<Array<[number, number]>>;
  /** Precomputed bounding box [minLon, minLat, maxLon, maxLat] for fast hit-testing */
  bbox: [number, number, number, number];
}

/**
 * Convert geographic latitude and longitude (in degrees) to 3D Cartesian coordinates
 * matching Three.js SphereGeometry UV mapping exactly.
 */
export function latLonToVector3(
  lat: number,
  lon: number,
  radius: number,
): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  return new THREE.Vector3(x, y, z);
}

/**
 * Convert a 3D point on the sphere back into geographic { lat, lon } in degrees.
 */
export function vector3ToLatLon(point: THREE.Vector3): {
  lat: number;
  lon: number;
} {
  const r = point.length();
  if (r === 0) return { lat: 0, lon: 0 };
  const lat =
    90 - (Math.acos(Math.max(-1, Math.min(1, point.y / r))) * 180) / Math.PI;
  const lon = (Math.atan2(-point.z, point.x) * 180) / Math.PI;
  return { lat, lon };
}

// ── Internal TopoJSON & GeoJSON Types ────────────────────────────────────────

interface GeoJsonGeometry {
  type: string;
  coordinates: unknown;
}

interface GeoJsonFeature {
  type?: string;
  properties?: Record<string, unknown>;
  geometry?: GeoJsonGeometry | null;
}

interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

interface TopoJsonTransform {
  scale: [number, number];
  translate: [number, number];
}

interface TopoJsonGeometry {
  type: string;
  id?: string | number;
  properties?: Record<string, unknown>;
  arcs?: unknown;
}

interface TopoJsonTopology {
  type: "Topology";
  transform?: TopoJsonTransform;
  objects: Record<
    string,
    {
      type: string;
      geometries?: TopoJsonGeometry[];
    }
  >;
  arcs: Array<Array<[number, number]>>;
}

function decodeTopoArc(
  topology: TopoJsonTopology,
  arcIndex: number,
): Array<[number, number]> {
  const isReversed = arcIndex < 0;
  const idx = isReversed ? ~arcIndex : arcIndex;
  const rawArc = topology.arcs[idx];
  if (!rawArc) return [];

  const scale = topology.transform?.scale ?? [1, 1];
  const translate = topology.transform?.translate ?? [0, 0];

  let x = 0;
  let y = 0;
  const coords: Array<[number, number]> = [];

  for (const pt of rawArc) {
    x += pt[0];
    y += pt[1];
    coords.push([x * scale[0] + translate[0], y * scale[1] + translate[1]]);
  }

  if (isReversed) coords.reverse();
  return coords;
}

function decodeTopoRing(
  topology: TopoJsonTopology,
  arcIndices: number[],
): Array<[number, number]> {
  const ring: Array<[number, number]> = [];
  for (const arcIdx of arcIndices) {
    const decoded = decodeTopoArc(topology, arcIdx);
    if (ring.length > 0 && decoded.length > 0) {
      ring.push(...decoded.slice(1));
    } else {
      ring.push(...decoded);
    }
  }
  return ring;
}

function computeBBox(
  polygons: Array<Array<[number, number]>>,
): [number, number, number, number] {
  let minLon = 180;
  let minLat = 90;
  let maxLon = -180;
  let maxLat = -90;
  for (const ring of polygons) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return [minLon, minLat, maxLon, maxLat];
}

function extractCountryName(props?: Record<string, unknown>): string {
  if (!props) return "";
  const raw =
    props.NAME_EN ??
    props.NAME ??
    props.name ??
    props.ADMIN ??
    props.SOVEREIGNT ??
    "";
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Parse either a GeoJSON FeatureCollection or a TopoJSON Topology into
 * normalized CountryFeature objects.
 */
export function parseCountryBorders(geoJsonData: unknown): CountryFeature[] {
  if (!geoJsonData || typeof geoJsonData !== "object") return [];
  const data = geoJsonData as Record<string, unknown>;

  const countries: CountryFeature[] = [];

  if (data.type === "FeatureCollection" && Array.isArray(data.features)) {
    const fc = data as unknown as GeoJsonFeatureCollection;
    for (const feature of fc.features) {
      const geom = feature.geometry;
      if (!geom) continue;
      const name = extractCountryName(feature.properties);
      if (!name) continue;

      const polygons: Array<Array<[number, number]>> = [];
      if (geom.type === "Polygon" && Array.isArray(geom.coordinates)) {
        for (const ring of geom.coordinates as Array<Array<[number, number]>>) {
          if (ring.length >= 2) polygons.push(ring);
        }
      } else if (
        geom.type === "MultiPolygon" &&
        Array.isArray(geom.coordinates)
      ) {
        for (const poly of geom.coordinates as Array<
          Array<Array<[number, number]>>
        >) {
          for (const ring of poly) {
            if (ring.length >= 2) polygons.push(ring);
          }
        }
      }

      if (polygons.length > 0) {
        const props = feature.properties ?? {};
        const labelLon =
          typeof props.LABEL_X === "number" ? props.LABEL_X : undefined;
        const labelLat =
          typeof props.LABEL_Y === "number" ? props.LABEL_Y : undefined;
        const labelRank =
          typeof props.LABELRANK === "number" ? props.LABELRANK : undefined;
        const isoA3 =
          typeof props.ISO_A3 === "string" ? props.ISO_A3 : undefined;

        countries.push({
          name,
          isoA3,
          labelLat,
          labelLon,
          labelRank,
          polygons,
          bbox: computeBBox(polygons),
        });
      }
    }
  } else if (data.type === "Topology" && data.objects && data.arcs) {
    const topo = data as unknown as TopoJsonTopology;
    const objKey = Object.keys(topo.objects)[0];
    const obj = objKey ? topo.objects[objKey] : undefined;
    const geometries = obj?.geometries ?? [];

    for (const geom of geometries) {
      const name = extractCountryName(geom.properties) || String(geom.id ?? "");
      const polygons: Array<Array<[number, number]>> = [];

      if (geom.type === "Polygon" && Array.isArray(geom.arcs)) {
        for (const arcRing of geom.arcs as number[][]) {
          const decoded = decodeTopoRing(topo, arcRing);
          if (decoded.length >= 2) polygons.push(decoded);
        }
      } else if (geom.type === "MultiPolygon" && Array.isArray(geom.arcs)) {
        for (const polyArcs of geom.arcs as number[][][]) {
          for (const arcRing of polyArcs) {
            const decoded = decodeTopoRing(topo, arcRing);
            if (decoded.length >= 2) polygons.push(decoded);
          }
        }
      }

      if (polygons.length > 0) {
        countries.push({
          name,
          polygons,
          bbox: computeBBox(polygons),
        });
      }
    }
  }

  return countries;
}

/**
 * Append subdivided spherical line segments for a polygon ring so long straight
 * borders follow the spherical surface instead of clipping through the terrain.
 */
function appendRingSegments(
  ring: Array<[number, number]>,
  effectiveRadius: number,
  positions: number[],
  maxSegmentDegrees = 1.0,
): void {
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[i + 1];

    // Skip segments that jump across the antimeridian
    const dLon = lon2 - lon1;
    if (Math.abs(dLon) > 150) continue;

    const dLat = lat2 - lat1;
    const angularDist = Math.hypot(dLon, dLat);
    const steps = Math.max(1, Math.ceil(angularDist / maxSegmentDegrees));

    let prevVec = latLonToVector3(lat1, lon1, effectiveRadius);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const interpLat = lat1 + dLat * t;
      const interpLon = lon1 + dLon * t;
      const nextVec = latLonToVector3(interpLat, interpLon, effectiveRadius);

      positions.push(
        prevVec.x,
        prevVec.y,
        prevVec.z,
        nextVec.x,
        nextVec.y,
        nextVec.z,
      );
      prevVec = nextVec;
    }
  }
}

/**
 * Create Three.js LineSegments for all country borders on the sphere.
 * Renders a crisp golden-orange line geometry with an embedded soft luminous halo.
 */
export function createBorderGeometry(
  countries: CountryFeature[],
  radius: number,
  elevationOffset = 0.0025,
): THREE.LineSegments {
  const effectiveRadius = radius + elevationOffset;
  const positions: number[] = [];

  for (const country of countries) {
    for (const ring of country.polygons) {
      appendRingSegments(ring, effectiveRadius, positions, 1.0);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );

  // Subtle, natural orbital cartography border material (preserves photorealistic Earth surface)
  const material = new THREE.LineBasicMaterial({
    color: new THREE.Color(0x94a3b8),
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });

  const mainLines = new THREE.LineSegments(geometry, material);
  return mainLines;
}

/**
 * Create a brighter golden-amber highlighted border for a selected country.
 */
export function createCountryHighlight(
  country: CountryFeature,
  radius: number,
  elevationOffset = 0.004,
): THREE.LineSegments {
  const effectiveRadius = radius + elevationOffset;
  const positions: number[] = [];

  for (const ring of country.polygons) {
    appendRingSegments(ring, effectiveRadius, positions, 0.75);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );

  const material = new THREE.LineBasicMaterial({
    color: new THREE.Color(0xffd166),
    transparent: true,
    opacity: 0.98,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const highlight = new THREE.LineSegments(geometry, material);

  // Secondary halo for crisp selection visibility
  const outerMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(0xf59e0b),
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const outerHalo = new THREE.LineSegments(geometry, outerMat);
  outerHalo.scale.setScalar(1.0008);
  highlight.add(outerHalo);

  return highlight;
}

/**
 * 2D Ray-casting point-in-ring test in (lon, lat) space.
 */
function pointInRing(
  lon: number,
  lat: number,
  ring: Array<[number, number]>,
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    // Skip antimeridian-wrapping edges
    if (Math.abs(xj - xi) > 180) continue;

    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Find the exact CountryFeature containing the given (lat, lon) coordinate.
 */
export function findCountryAtLatLon(
  countries: CountryFeature[],
  lat: number,
  lon: number,
): CountryFeature | null {
  for (const country of countries) {
    const [minLon, minLat, maxLon, maxLat] = country.bbox;
    if (lat < minLat || lat > maxLat || lon < minLon || lon > maxLon) {
      continue;
    }
    for (const ring of country.polygons) {
      if (pointInRing(lon, lat, ring)) {
        return country;
      }
    }
  }
  return null;
}

