import { PhotorealisticEarth } from "../components/globe/PhotorealisticEarth";

/**
 * Standalone page for the Photorealistic 3D Earth Globe.
 * Renders a fullscreen interactive globe with country borders, labels, and atmospheric effects.
 */
export function GlobePage() {
  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <PhotorealisticEarth />
    </div>
  );
}

