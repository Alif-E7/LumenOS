import { useState } from "react";
import { useApi } from "../hooks/useApi";
import { listSpacecraft, createSpacecraft } from "../api/client";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import type { SpacecraftResponse } from "../types";

export function DesignPage() {
  const { data: spacecraft, loading, error, refetch } = useApi(listSpacecraft);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createSpacecraft({ name: newName.trim() });
      setNewName("");
      refetch();
    } catch (err) {
      console.error("Failed to create spacecraft:", err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-white mb-2">Spacecraft Designer</h1>
      <p className="text-slate-400 mb-8">
        Configure your spacecraft subsystems — power, thermal, comms, propulsion, and payload.
      </p>

      {/* Quick-create form */}
      <Card title="New Spacecraft" icon="🛠️" className="mb-8">
        <div className="flex gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Enter spacecraft name..."
            className="flex-1 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700
                       text-white placeholder-slate-500 focus:outline-none focus:ring-2
                       focus:ring-blue-500 focus:border-transparent"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
            {creating ? "Creating..." : "Create"}
          </Button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Creates a spacecraft with default subsystem values. You can customize everything after creation.
        </p>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500 mx-auto mb-4" />
          <p className="text-slate-400">Loading spacecraft...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <Card title="Error" icon="⚠️">
          <p className="text-red-400">Failed to load spacecraft: {error}</p>
          <p className="text-sm text-slate-500 mt-2">
            Make sure the API server is running on port 8000.
          </p>
        </Card>
      )}

      {/* Spacecraft list */}
      {spacecraft && spacecraft.length === 0 && !loading && (
        <Card>
          <p className="text-slate-400 text-center py-8">
            No spacecraft configurations yet. Create your first one above!
          </p>
        </Card>
      )}

      {spacecraft && spacecraft.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {spacecraft.map((sc: SpacecraftResponse) => (
            <Card key={sc.id} title={sc.name} icon="🛰️">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Mass</span>
                  <span className="text-slate-300">{sc.total_mass_kg.toFixed(1)} kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Solar Panels</span>
                  <span className="text-slate-300">
                    {sc.power.solar_panel_area_m2} m²
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Battery</span>
                  <span className="text-slate-300">
                    {sc.power.battery_capacity_wh} Wh
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Radiator</span>
                  <span className="text-slate-300">
                    {sc.thermal.radiator_area_m2} m²
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Payload</span>
                  <span className="text-slate-300">
                    {sc.payload.payload_type.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Antenna</span>
                  <span className="text-slate-300">{sc.comms.antenna_gain_dbi} dBi</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-500">
                Created {new Date(sc.created_at).toLocaleDateString()}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

