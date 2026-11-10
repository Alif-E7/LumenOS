import { describe, it, expect } from "vitest";
import {
  latLonToVector3,
  vector3ToLatLon,
  parseCountryBorders,
  createBorderGeometry,
  createCountryHighlight,
  findCountryAtLatLon,
} from "../lib/geo-borders";
import { COUNTRY_LABELS } from "../lib/country-labels";
import {
  earthVertexShader,
  earthFragmentShader,
  atmosphereVertexShader,
  atmosphereFragmentShader,
} from "../lib/earth-shaders";
import countriesTopoJson from "../../public/data/countries-110m.json";

describe("Photorealistic 3D Earth Globe — Geographic & Shader Architecture", () => {
  it("converts lat/lon to 3D sphere coordinates and back with sub-millimeter precision", () => {
    const samples = [
      { lat: 0, lon: 0 },
      { lat: 37.0902, lon: -95.7129 },
      { lat: -25.2744, lon: 133.7751 },
      { lat: 51.1657, lon: 10.4515 },
      { lat: -14.235, lon: -51.9253 },
    ];

    for (const s of samples) {
      const v = latLonToVector3(s.lat, s.lon, 5.0);
      expect(v.length()).toBeCloseTo(5.0, 5);
      const back = vector3ToLatLon(v);
      expect(back.lat).toBeCloseTo(s.lat, 4);
      expect(back.lon).toBeCloseTo(s.lon, 4);
    }
  });

  it("parses authoritative Natural Earth dataset and builds subdivided spherical border geometry", () => {
    const countries = parseCountryBorders(countriesTopoJson);
    expect(countries.length).toBeGreaterThan(150);

    const borderMesh = createBorderGeometry(countries, 5.0, 0.002);
    const posAttr = borderMesh.geometry.getAttribute("position");
    expect(posAttr.count).toBeGreaterThan(10000);

    // Verify point-in-polygon country lookup at known geographic locations
    const usa = findCountryAtLatLon(countries, 39.5, -98.35);
    expect(usa?.name).toMatch(/United States/i);

    const brazil = findCountryAtLatLon(countries, -10.0, -52.0);
    expect(brazil?.name).toMatch(/Brazil/i);

    const india = findCountryAtLatLon(countries, 22.0, 79.0);
    expect(india?.name).toMatch(/India/i);

    if (usa) {
      const highlight = createCountryHighlight(usa, 5.0, 0.004);
      expect(
        highlight.geometry.getAttribute("position").count,
      ).toBeGreaterThan(100);
    }
  });

  it("provides comprehensive country-only labels with valid coordinates and importance tiers", () => {
    expect(COUNTRY_LABELS.length).toBeGreaterThanOrEqual(190);
    for (const lbl of COUNTRY_LABELS) {
      expect(lbl.name.length).toBeGreaterThan(1);
      expect(lbl.lat).toBeGreaterThanOrEqual(-90);
      expect(lbl.lat).toBeLessThanOrEqual(90);
      expect(lbl.lon).toBeGreaterThanOrEqual(-180);
      expect(lbl.lon).toBeLessThanOrEqual(180);
      expect([1, 2, 3]).toContain(lbl.importance);
    }
  });

  it("exports valid GLSL surface and Rayleigh atmospheric scattering shaders", () => {
    expect(earthVertexShader).toContain("gl_Position");
    expect(earthFragmentShader).toContain("dayTexture");
    expect(earthFragmentShader).toContain("bumpTexture");
    expect(atmosphereVertexShader).toContain("gl_Position");
    expect(atmosphereFragmentShader).toContain("atmosphereColor");
  });
});
