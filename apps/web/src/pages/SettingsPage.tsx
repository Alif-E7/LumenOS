import { useState } from "react";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { StatusBadge } from "../components/StatusBadge";
import { clearMissionSession, loadDefaultExperience, saveDefaultExperience, type Experience } from "../lib/mission";
import { isHighDetailEarthEnabled, setHighDetailEarthEnabled } from "../lib/earth-imagery";

export function SettingsPage() {
  const [experience, setExperience] = useState<Experience>(() => loadDefaultExperience());
  const [highDetailEarth, setHighDetailEarth] = useState(() => isHighDetailEarthEnabled());
  const [engineerMode, setEngineerMode] = useState(
    () => localStorage.getItem("lumenos.engineerMode") === "true"
 );
  const [soundEnabled, setSoundEnabled] = useState(
    () => localStorage.getItem("lumenos.sound") !== "false"
 );
  const [highContrast, setHighContrast] = useState(
    () => localStorage.getItem("lumenos.highContrast") === "true"
 );
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const toggleExperience = (exp: Experience) => {
    setExperience(exp);
    saveDefaultExperience(exp);
  };

  const toggleHighDetail = (enabled: boolean) => {
    setHighDetailEarth(enabled);
    setHighDetailEarthEnabled(enabled);
  };

  const toggleEngineer = (enabled: boolean) => {
    setEngineerMode(enabled);
    localStorage.setItem("lumenos.engineerMode", String(enabled));
  };

  const toggleSound = (enabled: boolean) => {
    setSoundEnabled(enabled);
    localStorage.setItem("lumenos.sound", String(enabled));
  };

  const toggleHighContrast = (enabled: boolean) => {
    setHighContrast(enabled);
    localStorage.setItem("lumenos.highContrast", String(enabled));
  };

  const handleResetCareer = () => {
    localStorage.removeItem("lumenos.career");
    clearMissionSession();
    setResetMessage("Career XP and active session cleared successfully.");
    setTimeout(() => setResetMessage(null), 3000);
  };

  return (
 <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
 <div className="mb-10">
 <h1 className="text-3xl font-bold text-ink mb-2">Platform Settings</h1>
 <p className="text-muted">
          Configure telemetry detail, sound, accessibility, and local storage.
 </p>
 </div>

      {resetMessage && (
 <Card title="Storage Updated" className="mb-6 border-ok/40">
 <p className="text-sm text-ok">{resetMessage}</p>
 </Card>
 )}

 <div className="space-y-6">
        {/* Experience & Telemetry */}
 <Card title="Interface & Telemetry">
 <div className="space-y-4">
 <div className="p-3 bg-panel/60 border border-edge">
 <div className="flex items-center justify-between mb-2">
 <div>
 <span className="font-medium text-ink block">Default Experience</span>
 <span className="text-xs text-muted">
                      Cadet Play Mode is simplified with 3D visuals; Expert Console has full subsystem telemetry.
 </span>
 </div>
 </div>
 <div className="flex gap-2">
 <button
                    type="button"
                    onClick={() => toggleExperience("simple")}
                    className={`px-3 py-1.5 text-xs font-mono uppercase tracking-[0.1em] border transition-colors ${
                      experience === "simple"
                        ? "bg-accent text-void border-accent font-bold"
                        : "bg-panel text-muted border-edge hover:text-ink"
                    }`}
 >
                    🚀 Cadet Play Mode
 </button>
 <button
                    type="button"
                    onClick={() => toggleExperience("expert")}
                    className={`px-3 py-1.5 text-xs font-mono uppercase tracking-[0.1em] border transition-colors ${
                      experience === "expert"
                        ? "bg-accent text-void border-accent font-bold"
                        : "bg-panel text-muted border-edge hover:text-ink"
                    }`}
 >
                    🛰️ Expert Console
 </button>
 </div>
 </div>

 <label className="flex items-center justify-between p-3 rounded-none bg-panel/60 border border-edge cursor-pointer">
 <div>
 <span className="font-medium text-ink block">High-Detail Earth (Sentinel-2 Online)</span>
 <span className="text-xs text-muted">
                  Stream photo-realistic Sentinel-2 cloudless Earth mosaic when connected to the internet. Falls back to offline textures automatically.
 </span>
 </div>
 <input
                type="checkbox"
                checked={highDetailEarth}
                onChange={(e) => toggleHighDetail(e.target.checked)}
                className="h-5 w-5 accent-accent rounded-none"
              />
 </label>

 <label className="flex items-center justify-between p-3 rounded-none bg-panel/60 border border-edge cursor-pointer">
 <div>
 <span className="font-medium text-ink block">Default to Engineer Mode</span>
 <span className="text-xs text-muted">
                  Always display detailed physics formulas, radiative margins, and subsystem telemetry.
 </span>
 </div>
 <input
                type="checkbox"
                checked={engineerMode}
                onChange={(e) => toggleEngineer(e.target.checked)}
                className="h-5 w-5 accent-accent rounded-none"
              />
 </label>

 <label className="flex items-center justify-between p-3 rounded-none bg-panel/60 border border-edge cursor-pointer">
 <div>
 <span className="font-medium text-ink block">Mission Audio Cues</span>
 <span className="text-xs text-muted">
                  Play subtle chimes for anomalous events, eclipse transitions, and ground station locks.
 </span>
 </div>
 <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => toggleSound(e.target.checked)}
                className="h-5 w-5 accent-accent rounded-none"
              />
 </label>

 <label className="flex items-center justify-between p-3 rounded-none bg-panel/60 border border-edge cursor-pointer">
 <div>
 <span className="font-medium text-ink block">High Contrast Mode</span>
 <span className="text-xs text-muted">
                  Enhance border visibility and text sharpness for high-visibility mission monitoring.
 </span>
 </div>
 <input
                type="checkbox"
                checked={highContrast}
                onChange={(e) => toggleHighContrast(e.target.checked)}
                className="h-5 w-5 accent-accent rounded-none"
              />
 </label>
 </div>
 </Card>

        {/* Backend & Connectivity */}
 <Card title="Backend & Connectivity">
 <div className="flex items-center justify-between mb-4">
 <div>
 <p className="text-sm font-medium text-ink">FastAPI Authoritative Simulation Server</p>
 <p className="text-xs text-faint font-mono">http://localhost:8000 / ws://localhost:8000</p>
 </div>
 <StatusBadge label="ACTIVE" variant="success" />
 </div>
 <p className="text-xs text-muted">
            All orbital mechanics, power budgets, and role permissions are executed server-side.
 </p>
 </Card>

        {/* Local Storage & Profile Reset */}
 <Card title="Local Storage & Career Profile">
 <p className="text-sm text-muted mb-4">
            Career XP and active mission sessions are stored locally in your browser.
            You can reset your career progress at any time.
 </p>
 <Button variant="danger" size="sm" onClick={handleResetCareer}>
            Reset Career XP & Active Mission
 </Button>
 </Card>
 </div>
 </div>
 );
}

