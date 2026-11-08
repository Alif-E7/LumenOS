import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { validateSpacecraft } from "../api/client";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { StatusBadge } from "../components/StatusBadge";
import { BudgetMeter } from "../components/BudgetMeter";
import { loadMissionSession, saveMissionSession } from "../lib/mission";

/**
 * Design Review — validate the chosen spacecraft before launch.
 * Uses the backend validator; mass/power/thermal budgets are real.
 */
export function DesignReviewPage() {
  const navigate = useNavigate();
  const session = loadMissionSession();
  const [selectedId, setSelectedId] = useState<string | null>(session?.spacecraftId ?? null);
  const { data: spacecraftList, loading: listLoading, error: listError } = useApi(
    () => import("../api/client").then((m) => m.listSpacecraft()),
    []
  );
  const [validation, setValidation] = useState<Awaited<ReturnType<typeof validateSpacecraft>> | null>(null);
  const [validating, setValidating] = useState(false);
  const [validateError, setValidateError] = useState<string | null>(null);

  const runValidation = async () => {
    if (!selectedId) return;
    setValidating(true);
    setValidateError(null);
    try {
      const result = await validateSpacecraft(selectedId);
      setValidation(result);
    } catch (err) {
      setValidateError((err as Error).message);
    } finally {
      setValidating(false);
    }
  };

  const proceed = () => {
    if (!selectedId) return;
    if (session) {
      saveMissionSession({ ...session, spacecraftId: selectedId });
    }
    navigate("/launch");
  };

  if (!session) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Card title="No Mission Selected" icon="⚠️">
          <p className="text-muted text-sm">
            Start from the mission campaign so the review knows which contract
            this spacecraft must satisfy.
          </p>
          <Button className="mt-4" onClick={() => navigate("/missions")}>
            Go to Mission Campaign
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-ink mb-2">Design Review</h1>
      <p className="text-muted mb-8">
        Mission: <span className="text-ink">{session.missionName}</span> —
        pick your spacecraft and run the pre-flight validation.
      </p>

      {listLoading && <p className="text-muted">Loading saved configurations…</p>}
      {listError && (
        <Card title="API Error" icon="⚠️">
          <p className="text-crit text-sm">{listError}</p>
          <p className="text-sm text-ink0 mt-2">Start the API server on port 8000.</p>
        </Card>
      )}

      {spacecraftList && spacecraftList.length === 0 && (
        <Card title="No Spacecraft Yet" icon="🛠️">
          <p className="text-muted text-sm mb-4">
            You need at least one spacecraft configuration. Build one in the designer.
          </p>
          <Button onClick={() => navigate("/design")}>Open Spacecraft Designer</Button>
        </Card>
      )}

      {spacecraftList && spacecraftList.length > 0 && (
        <>
          <fieldset className="mb-6">
            <legend className="text-sm font-medium text-ink mb-2">Spacecraft Configuration</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {spacecraftList.map((sc) => (
                <button
                  key={sc.id}
                  onClick={() => { setSelectedId(sc.id); setValidation(null); }}
                  aria-pressed={selectedId === sc.id}
                  className={`rounded-none border p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-accent ${
                    selectedId === sc.id
                      ? "border-accent bg-accent/10/30"
                      : "border-edge bg-panel/50 hover:border-edge-strong"
                  }`}
                >
                  <p className="font-medium text-ink">🛰️ {sc.name}</p>
                  <p className="text-xs text-ink0 mt-1 font-mono">
                    {sc.total_mass_kg.toFixed(0)} kg · {sc.power.solar_panel_area_m2} m² panels ·{" "}
                    {sc.thermal.radiator_area_m2} m² radiator
                  </p>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex gap-2 mb-8">
            <Button variant="secondary" onClick={runValidation} disabled={!selectedId || validating}>
              {validating ? "Validating…" : "Run Pre-Flight Validation"}
            </Button>
            <Button variant="ghost" onClick={() => navigate("/design")}>
              Edit in Designer
            </Button>
          </div>

          {validation && (
            <Card title="Validation Report" icon="🧪" className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <StatusBadge
                  label={validation.valid ? "PASSED — cleared for launch" : "FAILED — fix errors first"}
                  variant={validation.valid ? "success" : "danger"}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <BudgetMeter remaining={validation.mass_budget_kg} total={Math.max(validation.mass_budget_kg, 1)} showNumbers />
                <BudgetMeter remaining={validation.power_budget_w} total={Math.max(validation.power_budget_w, 1)} showNumbers />
                <BudgetMeter remaining={validation.thermal_margin_pct} total={100} showNumbers />
              </div>
              {validation.errors.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-sm font-semibold text-crit mb-1">Errors</h4>
                  <ul className="text-sm text-crit list-disc list-inside">
                    {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
              {validation.warnings.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-warn mb-1">Warnings</h4>
                  <ul className="text-sm text-warn list-disc list-inside">
                    {validation.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
            </Card>
          )}

          {validateError && (
            <Card title="Validation Failed to Run" icon="⚠️" className="mb-8">
              <p className="text-crit text-sm">{validateError}</p>
            </Card>
          )}

          <div className="flex justify-end">
            <Button onClick={proceed} disabled={!selectedId}>
              Proceed to Launch Checklist →
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
