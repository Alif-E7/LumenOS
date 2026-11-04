import { useState } from "react";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { StatusBadge } from "../components/StatusBadge";
import { clearMissionSession } from "../lib/mission";

export function SettingsPage() {
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
        <h1 className="text-3xl font-bold text-white mb-2">Platform Settings</h1>
        <p className="text-slate-400">
          Configure telemetry detail, sound, accessibility, and local storage.
        </p>
      </div>

      {resetMessage && (
        <Card title="Storage Updated" icon="ℹ️" className="mb-6 border-green-500/40">
          <p className="text-sm text-green-400">{resetMessage}</p>
        </Card>
      )}

      <div className="space-y-6">
        {/* Experience & Telemetry */}
        <Card title="Interface & Telemetry" icon="🎛️">
          <div className="space-y-4">
            <label className="flex items-center justify-between p-3 rounded-lg bg-slate-900/60 border border-slate-800 cursor-pointer">
              <div>
                <span className="font-medium text-white block">Default to Engineer Mode</span>
                <span className="text-xs text-slate-400">
                  Always display detailed physics formulas, radiative margins, and subsystem telemetry.
                </span>
              </div>
              <input
                type="checkbox"
                checked={engineerMode}
                onChange={(e) => toggleEngineer(e.target.checked)}
                className="h-5 w-5 accent-blue-500 rounded"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-lg bg-slate-900/60 border border-slate-800 cursor-pointer">
              <div>
                <span className="font-medium text-white block">Mission Audio Cues</span>
                <span className="text-xs text-slate-400">
                  Play subtle chimes for anomalous events, eclipse transitions, and ground station locks.
                </span>
              </div>
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => toggleSound(e.target.checked)}
                className="h-5 w-5 accent-blue-500 rounded"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-lg bg-slate-900/60 border border-slate-800 cursor-pointer">
              <div>
                <span className="font-medium text-white block">High Contrast Mode</span>
                <span className="text-xs text-slate-400">
                  Enhance border visibility and text sharpness for high-visibility mission monitoring.
                </span>
              </div>
              <input
                type="checkbox"
                checked={highContrast}
                onChange={(e) => toggleHighContrast(e.target.checked)}
                className="h-5 w-5 accent-blue-500 rounded"
              />
            </label>
          </div>
        </Card>

        {/* Backend & Connectivity */}
        <Card title="Backend & Connectivity" icon="📡">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium text-white">FastAPI Authoritative Simulation Server</p>
              <p className="text-xs text-slate-500 font-mono">http://localhost:8000 / ws://localhost:8000</p>
            </div>
            <StatusBadge label="ACTIVE" variant="success" />
          </div>
          <p className="text-xs text-slate-400">
            All orbital mechanics, power budgets, and role permissions are executed server-side.
          </p>
        </Card>

        {/* Local Storage & Profile Reset */}
        <Card title="Local Storage & Career Profile" icon="💾">
          <p className="text-sm text-slate-400 mb-4">
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

