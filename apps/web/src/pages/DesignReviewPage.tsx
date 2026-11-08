import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { validateSpacecraft } from "../api/client";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
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
      <div className="mx-auto max-w-4xl px-4 py-12">
        <Card title="No Mission Selected">
          <p className="text-sm text-muted">
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
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <PageHeader
        kicker="Pre-flight"
        title="Design Review"
        description={`Mission: ${session.missionName} — pick your spacecraft and run the pre-flight validation.`}
        className="mb-8"
      />

      {listLoading && <p className="font-mono text-xs text-faint">LOADING SAVED CONFIGURATIONS…</p>}
      {listError && (
        <Card title="API Error">
          <p className="text-sm text-crit">{listError}</p>
          <p className="mt-2 text-sm text-faint">Start the API server on port 8000.</p>
        </Card>
      )}

      {spacecraftList && spacecraftList.length === 0 && (
        <Card title="No Spacecraft Yet">
          <p className="mb-4 text-sm text-muted">
            You need at least one spacecraft configuration. Build one in the designer.
          </p>
          <Button onClick={() => navigate("/design")}>Open Spacecraft Designer</Button>
        </Card>
      )}

      {spacecraftList && spacecraftList.length > 0 && (
        <>
          <fieldset className="mb-6">
            <legend className="micro-label mb-2 text-faint">Spacecraft Configuration</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {spacecraftList.map((sc) => (
                <button
                  key={sc.id}
                  onClick={() => { setSelectedId(sc.id); setValidation(null); }}
                  aria-pressed={selectedId === sc.id}
                  className={`tactical-frame-soft border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                    selectedId === sc.id
                      ? "border-accent bg-accent/10"
                      : "border-edge bg-panel/50 hover:border-edge-strong"
                  }`}
                >
                  <p className="font-medium text-ink">{sc.name}</p>
                  <p className="data-readout mt-1 text-xs text-faint">
                    {sc.total_mass_kg.toFixed(0)} kg · {sc.power.solar_panel_area_m2} m² panels ·{" "}
                    {sc.thermal.radiator_area_m2} m² radiator
                  </p>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mb-8 flex gap-2">
            <Button variant="secondary" onClick={runValidation} disabled={!selectedId || validating}>
              {validating ? "Validating…" : "Run Pre-Flight Validation"}
            </Button>
            <Button variant="ghost" onClick={() => navigate("/design")}>
              Edit in Designer
            </Button>
          </div>

          {validation && (
            <Card frame title="Validation Report" className="mb-8">
              <div className="mb-4 flex items-center gap-2">
                <StatusBadge
                  label={validation.valid ? "PASSED — cleared for launch" : "FAILED — fix errors first"}
                  variant={validation.valid ? "success" : "danger"}
                />
              </div>
              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <BudgetMeter label="Mass Budget" unit="kg" remaining={validation.mass_budget_kg} total={Math.max(validation.mass_budget_kg, 1)} showNumbers />
                <BudgetMeter label="Power Budget" unit="W" remaining={validation.power_budget_w} total={Math.max(validation.power_budget_w, 1)} showNumbers />
                <BudgetMeter label="Thermal Margin" unit="%" remaining={validation.thermal_margin_pct} total={100} showNumbers />
              </div>
              {validation.errors.length > 0 && (
                <div className="mb-3">
                  <h4 className="micro-label mb-1.5 text-crit">Errors</h4>
                  <ul className="list-inside list-disc text-sm text-crit">
                    {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
              {validation.warnings.length > 0 && (
                <div>
                  <h4 className="micro-label mb-1.5 text-warn">Warnings</h4>
                  <ul className="list-inside list-disc text-sm text-warn">
                    {validation.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
            </Card>
          )}

          {validateError && (
            <Card title="Validation Failed to Run" className="mb-8">
              <p className="text-sm text-crit">{validateError}</p>
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
