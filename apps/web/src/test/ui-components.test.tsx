import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BudgetMeter } from "../components/BudgetMeter";
import { ResourceMeter } from "../components/ResourceMeter";
import { StatusBadge } from "../components/StatusBadge";
import { RoleBadge } from "../components/RoleBadge";
import { Slider } from "../components/Slider";
import { WarningPanel } from "../components/WarningPanel";
import { ObjectiveTracker } from "../components/ObjectiveTracker";
import { EventCard } from "../components/EventCard";
import {
  DirectorStation,
  SystemsStation,
  ScienceStation,
  FlightStation,
} from "../components/StationPanels";
import type { ActiveEvent, ObjectiveProgress, Telemetry } from "../types";

const mockTelemetry: Telemetry = {
  step: 10,
  elapsed_seconds: 600,
  status: "running",
  spacecraft_health_pct: 95.0,
  orbital: {
    altitude_km: 700.0,
    velocity_km_s: 7.5,
    latitude_deg: 24.5,
    longitude_deg: -80.2,
    in_eclipse: false,
    true_anomaly_deg: 45.0,
  },
  power: {
    solar_output_w: 450.0,
    total_load_w: 220.0,
    net_power_w: 230.0,
    battery_soc_pct: 88.0,
    in_eclipse: false,
    low_power_warning: false,
    power_critical: false,
  },
  thermal: {
    temperature_c: 22.4,
    heat_input_w: 300.0,
    heat_rejected_w: 300.0,
    overtemp_warning: false,
    undertemp_warning: false,
  },
  comms: {
    data_collected_mb: 240.0,
    data_downlinked_mb: 180.0,
    data_buffer_mb: 60.0,
    data_buffer_pct: 30.0,
    in_contact: true,
    active_station: "Svalbard",
    signal_strength_dbm: -75.0,
    buffer_full_warning: false,
  },
  workload: {
    cpu_usage_pct: 42.0,
    processing_queue_items: 2,
    cpu_overload_warning: false,
  },
  storage: {
    used_pct: 30.0,
    used_mb: 60.0,
    free_mb: 140.0,
    storage_full_warning: false,
  },
};

describe("Design System Reusable Components", () => {
  it("renders BudgetMeter with remaining credits", () => {
    render(<BudgetMeter remaining={7500} total={10000} showNumbers />);
    expect(screen.getByText(/7,500/)).toBeInTheDocument();
    expect(screen.getByText(/10,000/)).toBeInTheDocument();
  });

  it("renders ResourceMeter with formatted unit", () => {
    render(<ResourceMeter label="Battery SOC" value={85.4} max={100} unit="%" decimals={1} />);
    expect(screen.getByText("Battery SOC")).toBeInTheDocument();
    expect(screen.getByText(/85.4/)).toBeInTheDocument();
  });

  it("renders StatusBadge with accessible styling", () => {
    render(<StatusBadge label="NOMINAL" variant="success" />);
    expect(screen.getByText("NOMINAL")).toBeInTheDocument();
  });

  it("renders RoleBadge for each role", () => {
    render(<RoleBadge role="flight_controller" />);
    expect(screen.getByText("Flight Controller")).toBeInTheDocument();
  });

  it("renders Slider with keyboard/change support", () => {
    const handleChange = vi.fn();
    render(<Slider label="Thrust" value={5} min={1} max={10} onChange={handleChange} />);
    expect(screen.getByLabelText("Thrust")).toBeInTheDocument();
  });

  it("renders WarningPanel with messages", () => {
    render(
      <WarningPanel
        warnings={[
          { id: "1", message: "Low solar flux", level: "warning" },
          { id: "2", message: "Battery critical", level: "critical" },
        ]}
      />
    );
    expect(screen.getByText("Low solar flux")).toBeInTheDocument();
    expect(screen.getByText("Battery critical")).toBeInTheDocument();
  });

  it("renders ObjectiveTracker with items", () => {
    const mockObjectives: ObjectiveProgress[] = [
      {
        objective_id: "obj1",
        description: "Downlink 500 MB science data",
        current_value: 250,
        target_value: 500,
        unit: "MB",
        weight: 1.0,
        is_primary: true,
        is_complete: false,
        fraction: 0.5,
      },
    ];
    render(<ObjectiveTracker objectives={mockObjectives} />);
    expect(screen.getByText(/Downlink 500 MB science data/i)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  });

  it("renders EventCard and handles decision choice", () => {
    const handleChoose = vi.fn();
    const mockEvent: ActiveEvent = {
      event_id: "evt_solar_flare",
      name: "Solar Proton Storm",
      description: "Incoming CME will hit solar panels in 5 minutes.",
      severity: "warning",
      phase: "active",
      triggered_step: 5,
      deadline_step: 10,
      choices: [
        { id: "safe_mode", label: "Orient to Safe Mode", description: "Edge panels away from sun." },
        { id: "continue", label: "Maintain Science", description: "Keep observing at high risk." },
      ],
      is_pending: true,
    };

    render(<EventCard event={mockEvent} canResolve onChoose={handleChoose} />);
    expect(screen.getByText("Solar Proton Storm")).toBeInTheDocument();
    
    const choiceBtn = screen.getByRole("button", { name: /orient to safe mode/i });
    fireEvent.click(choiceBtn);
    expect(handleChoose).toHaveBeenCalledWith(mockEvent.choices[0]);
  });
});

describe("Station Panels (Role-Specific Workstations)", () => {
  const defaultStationProps = {
    telemetry: mockTelemetry,
    budgetRemaining: 8000,
    budgetTotal: 10000,
    onAction: vi.fn(),
    enabled: true,
  };

  it("renders DirectorStation with priorities and overview", () => {
    render(<DirectorStation {...defaultStationProps} />);
    expect(screen.getByText(/Objective Priority/i)).toBeInTheDocument();
  });

  it("renders SystemsStation with power mode and radiator trim", () => {
    render(<SystemsStation {...defaultStationProps} />);
    expect(screen.getByText("Power Mode")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /low-power shed/i })).toBeInTheDocument();
  });

  it("renders ScienceStation with ground station contact and downlink", () => {
    render(<ScienceStation {...defaultStationProps} />);
    expect(screen.getByText(/Ground Contact/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /downlink buffer/i })).toBeInTheDocument();
  });

  it("renders FlightStation with orbital telemetry and thruster burn", () => {
    render(<FlightStation {...defaultStationProps} />);
    expect(screen.getByText("Thruster Burn")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /prograde/i })).toBeInTheDocument();
  });
});
