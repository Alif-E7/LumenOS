#!/usr/bin/env node
/**
 * Generate the Lumen-1 spacecraft 3D model as a binary glTF (.glb).
 *
 * Zero dependencies — builds the mesh buffers procedurally and writes a
 * spec-compliant GLB (JSON chunk + BIN chunk) used by the Cesium flight
 * view and the hangar preview. Run from anywhere:
 *
 *   node scripts/generate_satellite_model.mjs
 *
 * Model axes (glTF Y-up; Cesium rotates Y-up→Z-up on load):
 *   +X = forward (velocity)   thruster sits at -X
 *   +Y = up (away from Earth) solar faces point +Y, dish points -Y
 *   ±Z = solar wing span
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(scriptDir, "..", "apps", "web", "public", "models", "lumen-satellite.glb");

// ── Geometry helpers ────────────────────────────────────────────────────────

/**
 * Axis-aligned box centered at (cx,cy,cz) with sizes (sx,sy,sz).
 * Flat-shaded: 24 vertices (4 per face) + 36 indices.
 */
function makeBox(cx, cy, cz, sx, sy, sz) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2;
  const y0 = cy - sy / 2, y1 = cy + sy / 2;
  const z0 = cz - sz / 2, z1 = cz + sz / 2;

  const faces = [
    // [normal, four corners (CCW seen from outside)]
    { n: [ 1, 0, 0], v: [[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1]] },
    { n: [-1, 0, 0], v: [[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[x0,y0,z0]] },
    { n: [ 0, 1, 0], v: [[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0]] },
    { n: [ 0,-1, 0], v: [[x0,y0,z1],[x0,y0,z0],[x1,y0,z0],[x1,y0,z1]] },
    { n: [ 0, 0, 1], v: [[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[x0,y0,z1]] },
    { n: [ 0, 0,-1], v: [[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0]] },
  ];

  const positions = [];
  const normals = [];
  const indices = [];
  for (const f of faces) {
    const base = positions.length / 3;
    for (const p of f.v) {
      positions.push(...p);
      normals.push(...f.n);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, normals, indices };
}

/**
 * Vertical (Y-axis) cylinder/cone centered at (cx,cy,cz).
 * radiusTop may be smaller than radiusBottom (cone). Flat-shaded segments.
 */
function makeCylinder(cx, cy, cz, radiusTop, radiusBottom, height, segments = 16) {
  const y0 = cy - height / 2; // bottom (-Y)
  const y1 = cy + height / 2; // top (+Y)
  const positions = [];
  const normals = [];
  const indices = [];

  const slope = (radiusBottom - radiusTop) / height;
  const sideN = (t) => {
    // Perpendicular to the side wall in the (radial, y) plane
    const len = Math.hypot(1, slope);
    return [1 / len, slope / len]; // (radial, y) components
  };

  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * 2 * Math.PI;
    const a1 = ((i + 1) / segments) * 2 * Math.PI;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    const [nr, ny] = sideN();

    // Side quad (two triangles, CCW from outside)
    const b = positions.length / 3;
    positions.push(cx + c0 * radiusBottom, y0, cz + s0 * radiusBottom);
    positions.push(cx + c1 * radiusBottom, y0, cz + s1 * radiusBottom);
    positions.push(cx + c1 * radiusTop, y1, cz + s1 * radiusTop);
    positions.push(cx + c0 * radiusTop, y1, cz + s0 * radiusTop);
    for (let k = 0; k < 4; k++) normals.push(c0 * nr, ny, s0 * nr);
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3);

    // Caps (fan around center vertex)
    if (radiusTop > 0.001) {
      const t = positions.length / 3;
      positions.push(cx, y1, cz); normals.push(0, 1, 0);
      positions.push(cx + c0 * radiusTop, y1, cz + s0 * radiusTop); normals.push(0, 1, 0);
      positions.push(cx + c1 * radiusTop, y1, cz + s1 * radiusTop); normals.push(0, 1, 0);
      indices.push(t, t + 2, t + 1); // CW seen from above → flip winding
    }
    if (radiusBottom > 0.001) {
      const t = positions.length / 3;
      positions.push(cx, y0, cz); normals.push(0, -1, 0);
      positions.push(cx + c0 * radiusBottom, y0, cz + s0 * radiusBottom); normals.push(0, -1, 0);
      positions.push(cx + c1 * radiusBottom, y0, cz + s1 * radiusBottom); normals.push(0, -1, 0);
      indices.push(t, t + 1, t + 2);
    }
  }
  return { positions, normals, indices };
}

// ── Materials (PBR metallic-roughness) ──────────────────────────────────────

const MATERIALS = [
  { name: "SilverBody",  color: [0.78, 0.80, 0.84, 1.0], metallic: 0.9, roughness: 0.30 },
  { name: "GoldFoil",    color: [0.86, 0.63, 0.18, 1.0], metallic: 1.0, roughness: 0.38 },
  { name: "SolarPanel",  color: [0.04, 0.11, 0.34, 1.0], metallic: 0.6, roughness: 0.28 },
  { name: "DishWhite",   color: [0.92, 0.92, 0.95, 1.0], metallic: 0.1, roughness: 0.50 },
  { name: "NozzleDark",  color: [0.14, 0.15, 0.17, 1.0], metallic: 0.8, roughness: 0.45 },
];

// ── Spacecraft parts (dimensions in meters, real LEO-smallsat scale) ────────

const PARTS = [
  // Main bus: 1.6 m long (flight direction) × 1.2 × 1.2
  { geom: makeBox(0, 0, 0, 1.6, 1.2, 1.2), material: 0 },
  // Gold MLI band wrap around the bus middle
  { geom: makeBox(0, 0, 0, 1.64, 0.34, 1.64), material: 1 },
  // Gold radiator plate on the zenith (+Y) face
  { geom: makeBox(0, 0.615, 0, 1.3, 0.03, 1.3), material: 1 },
  // Solar wings: 2 × (1.0 chord × 2.4 span), thin panels along ±Z
  { geom: makeBox(0, 0.02,  1.85, 1.0, 0.05, 2.4), material: 2 },
  { geom: makeBox(0, 0.02, -1.85, 1.0, 0.05, 2.4), material: 2 },
  // Wing connect struts
  { geom: makeBox(0, 0.02,  0.75, 0.12, 0.06, 0.35), material: 0 },
  { geom: makeBox(0, 0.02, -0.75, 0.12, 0.06, 0.35), material: 0 },
  // High-gain dish opening toward Earth (-Y) with feed rod
  { geom: makeCylinder(0, -0.70, 0, 0.05, 0.45, 0.18, 20), material: 3 },
  { geom: makeCylinder(0, -0.78, 0, 0.02, 0.02, 0.38, 8), material: 3 },
  // Thruster nozzle at the -X (retrograde) end
  { geom: makeCylinder(-0.98, 0, 0, 0.28, 0.11, 0.36, 16), material: 4 },
  // Small omni antenna whiskers on the zenith face
  { geom: makeCylinder( 0.55, 0.72, 0.25, 0.015, 0.015, 0.24, 6), material: 3 },
  { geom: makeCylinder(-0.40, 0.70, -0.30, 0.012, 0.012, 0.18, 6), material: 3 },
];

// ── GLB assembly ────────────────────────────────────────────────────────────

const binary = [];
let byteLength = 0;

function pushBytes(values, Type, elementSize) {
  // Pad to 4-byte alignment
  while (byteLength % 4 !== 0) { binary.push(0); byteLength++; }
  const offset = byteLength;
  const arr = new Type(values);
  for (const b of new Uint8Array(arr.buffer)) binary.push(b);
  byteLength += arr.byteLength;
  return { offset, length: arr.byteLength };
}

const bufferViews = [];
const accessors = [];
const primitives = [];

function addGeometry({ positions, normals, indices }, materialIndex) {
  const posView = pushBytes(positions, Float32Array, 4);
  const normView = pushBytes(normals, Float32Array, 4);
  const idxView = pushBytes(indices, Uint16Array, 2);

  bufferViews.push(
    { buffer: 0, byteOffset: posView.offset, byteLength: posView.length, target: 34962 },
    { buffer: 0, byteOffset: normView.offset, byteLength: normView.length, target: 34962 },
    { buffer: 0, byteOffset: idxView.offset, byteLength: idxView.length, target: 34963 },
  );

  const posAccessor = accessors.length;
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }
  }
  accessors.push(
    { bufferView: bufferViews.length - 3, componentType: 5126, count: positions.length / 3, type: "VEC3", min, max },
    { bufferView: bufferViews.length - 2, componentType: 5126, count: normals.length / 3, type: "VEC3" },
    { bufferView: bufferViews.length - 1, componentType: 5123, count: indices.length, type: "SCALAR" },
  );

  primitives.push({
    attributes: { POSITION: posAccessor, NORMAL: posAccessor + 1 },
    indices: posAccessor + 2,
    material: materialIndex,
    mode: 4,
  });
}

for (const part of PARTS) addGeometry(part.geom, part.material);

const gltf = {
  asset: { version: "2.0", generator: "LumenOS generate_satellite_model.mjs" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: "Lumen1Spacecraft" }],
  meshes: [{ name: "Spacecraft", primitives }],
  materials: MATERIALS.map((m) => ({
    name: m.name,
    pbrMetallicRoughness: {
      baseColorFactor: m.color,
      metallicFactor: m.metallic,
      roughnessFactor: m.roughness,
    },
    doubleSided: false,
  })),
  buffers: [{ byteLength: byteLength }],
  bufferViews,
  accessors,
};

// Pad the binary chunk to 4-byte alignment (GLB requirement)
while (binary.length % 4 !== 0) binary.push(0);
gltf.buffers[0].byteLength = binary.length;

// JSON chunk padded with spaces to 4-byte boundary
let jsonText = JSON.stringify(gltf);
while (jsonText.length % 4 !== 0) jsonText += " ";
const jsonBytes = Uint8Array.from(jsonText, (c) => c.charCodeAt(0));

const header = 12;
const total = header + 8 + jsonBytes.length + 8 + binary.length;
const out = new Uint8Array(total);
const view = new DataView(out.buffer);

view.setUint32(0, 0x46546c67, true); // "glTF"
view.setUint32(4, 2, true);          // version
view.setUint32(8, total, true);      // total length

view.setUint32(12, jsonBytes.length, true);
view.setUint32(16, 0x4e4f534a, true); // "JSON"
out.set(jsonBytes, 20);

const binHeader = 20 + jsonBytes.length;
view.setUint32(binHeader, binary.length, true);
view.setUint32(binHeader + 4, 0x004e4942, true); // "BIN\0"
out.set(Uint8Array.from(binary), binHeader + 8);

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, out);

const triCount = primitives.reduce((n, p) => n + accessors[p.indices].count / 3, 0);
console.log(`✓ wrote ${resolve(OUT_PATH)}`);
console.log(`  ${total.toLocaleString()} bytes · ${PARTS.length} parts · ${triCount} triangles`);
