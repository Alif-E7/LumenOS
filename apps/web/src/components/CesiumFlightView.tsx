import type { OrbitalTelemetry, CommsTelemetry, ClockState, ActiveEvent } from "../types";
import { UltraRealisticEarthFlight } from "./flight/UltraRealisticEarthFlight";

export interface CesiumFlightViewProps {
  orbital?: OrbitalTelemetry | null;
  comms?: CommsTelemetry | null;
  clock?: ClockState | null;
  scenarioId?: string;
  groundTrackPoints?: Array<{ latitude_deg: number; longitude_deg: number; altitude_km?: number }>;
  activeEvent?: ActiveEvent | null;
  className?: string;
  forceFallback?: boolean;
}

/**
 * Primary 3D Space Flight View.
 * Renders the photorealistic 3D Earth, glowing orbit ring, radiant Sun in space,
 * 3D satellite model, and live animated disaster events (wildfires, volcanoes, floods, solar storms).
 */
export function CesiumFlightView(props: CesiumFlightViewProps) {
  return <UltraRealisticEarthFlight {...props} />;
}
