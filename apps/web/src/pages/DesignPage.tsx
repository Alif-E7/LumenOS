import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { listSpacecraft, createSpacecraft } from "../api/client";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { Slider } from "../components/Slider";
import { Selector } from "../components/Selector";
import { X, Satellite } from "lucide-react";
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
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <PageHeader
        kicker="Spacecraft Architect"
        title="Spacecraft Designer"
        description="Engineer your satellite bus. Configure solar array, battery reserve, radiator sizing, and primary sensor."
        actions={
          session && (
            <div className="text-right">
              <div className="micro-label text-faint">Target Mission</div>
              <div className="font-mono text-sm text-accent">{session.missionName}</div>
            </div>
          )
        }
        className="mb-8"
      />

      {/* Interactive Builder */}
      <Card frame title="Build Custom Spacecraft" icon={<Satellite className="h-4 w-4" />} className="mb-10">
        <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-5">
            <h4 className="micro-label border-b border-edge pb-2 text-muted">Power Subsystem</h4>
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

          <div className="space-y-5">
            <h4 className="micro-label border-b border-edge pb-2 text-muted">Thermal & Comms</h4>
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

          <div className="space-y-5">
            <h4 className="micro-label border-b border-edge pb-2 text-muted">Payload Instrument</h4>
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

        <div className="flex flex-col gap-3 border-t border-edge pt-4 sm:flex-row">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name your spacecraft configuration (e.g. Phoenix-1)…"
            className="flex-1 border border-edge-strong bg-raised px-4 py-2 text-sm text-ink
                       placeholder-faint focus:border-accent focus:outline-none"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
            {creating ? "Saving…" : "Save Configuration"}
          </Button>
        </div>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin border-t-2 border-accent" />
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Loading configurations</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <Card title="Error">
          <p className="text-crit">Failed to load spacecraft: {error}</p>
        </Card>
      )}

      {/* Success Notification */}
      {successNotice && (
        <div className="mb-6 flex items-center justify-between border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">
          <span>{successNotice}</span>
          <button
            onClick={() => setSuccessNotice(null)}
            aria-label="Dismiss notification"
            className="transition-colors hover:text-ink"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}

      {/* Spacecraft list */}
      <h2 className="micro-label mb-4 text-faint">Saved Configurations</h2>
      {spacecraft && spacecraft.length === 0 && !loading && (
        <Card>
          <p className="py-8 text-center text-muted">
            No configurations saved yet. Use the builder above to craft your first satellite.
          </p>
        </Card>
      )}

      {spacecraft && spacecraft.length > 0 && (
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {spacecraft.map((sc: SpacecraftResponse) => (
            <Card
              key={sc.id}
              title={sc.name}
              frame={selectedId === sc.id}
              className={selectedId === sc.id ? "border-accent bg-accent/[0.06]" : ""}
            >
              <div className="data-readout mb-4 space-y-1.5 text-sm">
                <div className="flex justify-between border-b border-edge/60 pb-1">
                  <span className="text-faint">Total Mass</span>
                  <span className="text-ink">{sc.total_mass_kg.toFixed(1)} kg</span>
                </div>
                <div className="flex justify-between border-b border-edge/60 pb-1">
                  <span className="text-faint">Solar Panels</span>
                  <span className="text-ink">{sc.power.solar_panel_area_m2} m²</span>
                </div>
                <div className="flex justify-between border-b border-edge/60 pb-1">
                  <span className="text-faint">Battery</span>
                  <span className="text-ink">{sc.power.battery_capacity_wh} Wh</span>
                </div>
                <div className="flex justify-between border-b border-edge/60 pb-1">
                  <span className="text-faint">Radiator</span>
                  <span className="text-ink">{sc.thermal.radiator_area_m2} m²</span>
                </div>
                <div className="flex justify-between border-b border-edge/60 pb-1">
                  <span className="text-faint">Sensor Payload</span>
                  <span className="text-ink capitalize">{sc.payload.payload_type.replace(/_/g, " ")}</span>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-edge pt-3">
                <span className="data-readout text-xs text-faint">
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
