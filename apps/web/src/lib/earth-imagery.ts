/**
 * Earth imagery resolution — ultra-realistic online satellite imagery with a
 * zero-credential offline fallback.
 *
 * When the player is online (and has not disabled high-detail Earth in
 * settings) the globe uses the Sentinel-2 "cloudless" mosaic — real
 * satellite photography of the whole planet. Without internet, or when the
 * tile probe fails, we fall back to the Cesium-bundled offline NaturalEarthII
 * tiles so the mission always flies.
 */

const HI_DETAIL_KEY = "lumenos.hiDetailEarth";
const PROBE_TIMEOUT_MS = 4000;

/** EOX WMTS (RESTful, EPSG:3857) — real Sentinel-2 imagery, no API key. */
const ONLINE_TEMPLATE =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/{z}/{y}/{x}.jpg";

const ONLINE_CREDIT =
  "Sentinel-2 cloudless © EOX IT Services — contains modified Copernicus Sentinel data (CC BY-NC-SA 4.0)";

export type EarthImagerySource = "online" | "offline" | "none";

export interface EarthImageryResult {
  /** Ready-to-use Cesium ImageryProvider (null when even offline tiles fail). */
  provider: unknown | null;
  source: EarthImagerySource;
}

export function isHighDetailEarthEnabled(): boolean {
  try {
    return localStorage.getItem(HI_DETAIL_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setHighDetailEarthEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(HI_DETAIL_KEY, String(enabled));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

/** Probe whether the online imagery service is reachable right now. */
async function probeOnline(): Promise<boolean> {
  if (typeof window === "undefined" || typeof fetch !== "function") return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const resp = await fetch(
      "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/0/0/0.jpg",
      { signal: controller.signal, cache: "no-store" }
    );
    return resp.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// One probe per page load — switching views must not re-ping the service.
let onlineProbe: Promise<boolean> | null = null;
function getOnlineProbe(): Promise<boolean> {
  if (!onlineProbe) onlineProbe = probeOnline();
  return onlineProbe;
}

/**
 * Resolve the best available Earth imagery layer for a Cesium viewer.
 *
 * @param Cesium the dynamically imported cesium module
 * @returns the provider to add via `viewer.imageryLayers.addImageryProvider`,
 *          plus which source was chosen (for the HUD badge)
 */
export async function resolveEarthImagery(
  Cesium: any
): Promise<EarthImageryResult> {
  // 1) Online Sentinel-2 mosaic (photo-realistic) when allowed & reachable
  if (isHighDetailEarthEnabled() && (await getOnlineProbe())) {
    try {
      const provider = new Cesium.UrlTemplateImageryProvider({
        url: ONLINE_TEMPLATE,
        credit: ONLINE_CREDIT,
        maximumLevel: 13,
      });
      return { provider, source: "online" };
    } catch {
      /* fall through to offline */
    }
  }

  // 2) Bundled offline tiles — always available, no credentials, no network
  try {
    const provider = await Cesium.TileMapServiceImageryProvider.fromUrl(
      Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII")
    );
    return { provider, source: "offline" };
  } catch {
    // 3) Bare WGS-84 ellipsoid
    return { provider: null, source: "none" };
  }
}
