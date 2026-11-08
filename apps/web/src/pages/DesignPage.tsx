import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { listSpacecraft, createSpacecraft } from "../api/client";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Slider } from "../components/Slider";
import { Selector } from "../components/Selector";
import { loadMissionSession, saveMissionSession } from "../lib/mission";
import type { SpacecraftResponse } from "../types";

export function DesignPage() {
  const navigate = useNavigate();
  const session = loadMissionSession();
  const { data: remoteSpacecraft, loading, error, refetch } = useApi(listSpacecraft);
  
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(session?.spacecraftId ?? null);
  const [localSpacecraft, setLocalSpacecraft] = useState<SpacecraftResponse[]>([]);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Combined spacecraft list guaranteeing that saved configurations appear immediately
  const spacecraft = [
    ...localSpacecraft,
    ...(remoteSpacecraft || []).filter(
      (r) => !localSpacecraft.some((l) => l.id === r.id)
    ),
  ];

  // Subsystem configuration states
  const [solarArea, setSolarArea] = useState(4.0);
  const [batteryWh, setBatteryWh] = useState(1200);
  const [radiatorArea, setRadiatorArea] = useState(1.8);
  const [antennaGain, setAntennaGain] = useState(12.0);
  const [transmitPower, setTransmitPower] = useState(15.0);
  const [payloadType, setPayloadType] = useState("thermal_infrared");

  const handleCreate = async () => {
    const trimmedName = newName.trim();
    if (!trimmedName) return;
    setCreating(true);
    setSuccessNotice(null);
    try {
      const created = await createSpacecraft({
        name: trimmedName,
        power: {
          solar_panel_area_m2: solarArea,
          battery_capacity_wh: batteryWh,
        },
        thermal: {
          radiator_area_m2: radiatorArea,
        },
        comms: {
          antenna_gain_dbi: antennaGain,
          transmit_power_w: transmitPower,
        },
        payload: {
          payload_type: payloadType,
          mass_kg: 50.0,
          power_w: 120.0,
        },
      });
      // Immediately reflect created spacecraft in UI and select it
      setLocalSpacecraft((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
      setSelectedId(created.id);
      setNewName("");
      setSuccessNotice(`Spacecraft "${created.name}" successfully configured and saved!`);
      if (session) {
        saveMissionSession({ ...session, spacecraftId: created.id });
      }
      refetch();
    } catch (err) {
      console.error("Failed to create spacecraft:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleSelectAndProceed = (id: string) => {
    if (session) {
      saveMissionSession({ ...session, spacecraftId: id });
    }
    navigate("/review");
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
        <h1 className="text-3xl font-bold text-ink">Spacecraft Designer</h1>
        {session && (
          <div className="text-sm text-muted">
            Target Mission: <span className="text-accent font-medium">{session.missionName}</span>
          </div>
        )}
      </div>
      <p className="text-muted mb-8">
        Engineer your satellite bus. Configure solar array, battery reserve, radiator sizing, and primary sensor.
      </p>

      {/* Interactive Builder */}
      <Card title="Build Custom Spacecraft" icon="🛠️" className="mb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-ink border-b border-edge pb-1">⚡ Power Subsystem</h4>
            <Slider
              label="Solar Array Area"
              value={solarArea}
              min={1}
              max={10}
              step={0.5}
              unit="m²"
              onChange={setSolarArea}
            />
            <Slider
              label="Battery Capacity"
              value={batteryWh}
              min={400}
              max={4000}
              step={100}
              unit="Wh"
              onChange={setBatteryWh}
            />
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-ink border-b border-edge pb-1">❄️ Thermal & Comms</h4>
            <Slider
              label="Radiator Area"
              value={radiatorArea}
              min={0.5}
              max={5.0}
              step={0.1}
              unit="m²"
              onChange={setRadiatorArea}
            />
            <Slider
              label="Antenna Gain"
              value={antennaGain}
              min={4}
              max={24}
              step={1}
              unit="dBi"
              onChange={setAntennaGain}
            />
            <Slider
              label="Transmit Power"
              value={transmitPower}
              min={5}
              max={50}
              step={5}
              unit="W"
              onChange={setTransmitPower}
            />
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-ink border-b border-edge pb-1">🔬 Payload Instrument</h4>
            <Selector
              label="Sensor Suite"
              value={payloadType}
              options={[
                { value: "thermal_infrared", label: "Thermal Infrared (Wildfires)" },
                { value: "synthetic_aperture_radar", label: "Synthetic Aperture Radar (Floods)" },
                { value: "uv_coronagraph", label: "UV Coronagraph (Solar Storms)" },
                { value: "multispectral_imager", label: "Multispectral Imager (Volcanoes)" },
              ]}
              onChange={setPayloadType}
              hint="Match your sensor to the mission objective for maximum science yield."
            />
          </div>
        </div>

        <div className="pt-4 border-t border-edge flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name your spacecraft configuration (e.g. Phoenix-1)..."
            className="flex-1 px-4 py-2 rounded-none bg-raised border border-edge-strong
                       text-ink placeholder-faint focus:outline-none focus:ring-2
                       focus:ring-accent focus:border-transparent text-sm"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
            {creating ? "Saving..." : "Save Spacecraft Configuration"}
          </Button>
        </div>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-accent mx-auto mb-4" />
          <p className="text-muted">Loading configurations...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <Card title="Error" icon="⚠️">
          <p className="text-crit">Failed to load spacecraft: {error}</p>
        </Card>
      )}

      {/* Success Notification */}
      {successNotice && (
        <div className="mb-6 p-4 rounded-none border border-ok/40 bg-ok/10/20 text-sm text-ok flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✨</span>
            <span>{successNotice}</span>
          </div>
          <button
            onClick={() => setSuccessNotice(null)}
            className="text-xs text-ok hover:text-emerald-200"
          >
            ✕
          </button>
        </div>
      )}

      {/* Spacecraft list */}
      <h2 className="text-xl font-bold text-ink mb-4">Saved Configurations</h2>
      {spacecraft && spacecraft.length === 0 && !loading && (
        <Card>
          <p className="text-muted text-center py-8">
            No configurations saved yet. Use the builder above to craft your first satellite!
          </p>
        </Card>
      )}

      {spacecraft && spacecraft.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {spacecraft.map((sc: SpacecraftResponse) => (
            <Card
              key={sc.id}
              title={sc.name}
              icon="🛰️"
              className={selectedId === sc.id ? "border-accent bg-accent/10/20" : ""}
            >
              <div className="space-y-2 text-sm mb-4">
                <div className="flex justify-between">
                  <span className="text-ink0">Total Mass</span>
                  <span className="text-ink font-mono">{sc.total_mass_kg.toFixed(1)} kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink0">Solar Panels</span>
                  <span className="text-ink font-mono">{sc.power.solar_panel_area_m2} m²</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink0">Battery</span>
                  <span className="text-ink font-mono">{sc.power.battery_capacity_wh} Wh</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink0">Radiator</span>
                  <span className="text-ink font-mono">{sc.thermal.radiator_area_m2} m²</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink0">Sensor Payload</span>
                  <span className="text-ink capitalize">{sc.payload.payload_type.replace(/_/g, " ")}</span>
                </div>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-edge">
                <span className="text-xs text-ink0">
                  {new Date(sc.created_at).toLocaleDateString()}
                </span>
                <Button size="sm" onClick={() => handleSelectAndProceed(sc.id)}>
                  Select & Review →
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={() => navigate("/missions")}>
          ← Mission Brief
        </Button>
        <Button onClick={() => navigate("/review")} disabled={!spacecraft || spacecraft.length === 0}>
          Proceed to Design Review →
        </Button>
      </div>
    </div>
  );
}
