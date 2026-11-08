import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AccessibleMissionMap } from "../components/AccessibleMissionMap";
import { StatusBadge } from "../components/StatusBadge";
import { WarningPanel, type Warning } from "../components/WarningPanel";
import { ParticipantList, type ActionAuditEntry } from "../components/ParticipantList";

describe("Prompt 18 — Accessibility, Reliability & Hardening Frontend Tests", () => {
  describe("AccessibleMissionMap & Accessible Fallbacks", () => {
    it("renders equirectangular SVG map with accessible table and landmarks", () => {
      const mockOrbital = {
        altitude_km: 550.0,
        velocity_km_s: 7.58,
        latitude_deg: -33.7,
        longitude_deg: 150.3,
        in_eclipse: false,
        true_anomaly_deg: 45.0,
      };

      const mockComms = {
        connected: true,
        active_station_id: "svalbard",
        downlink_rate_mbps: 20.0,
        uplink_rate_kbps: 64.0,
        signal_strength_dbm: -80.0,
        snr_db: 15.0,
      };

      render(
        <AccessibleMissionMap
          orbital={mockOrbital as any}
          comms={mockComms as any}
          scenarioId="wildfire"
        />
      );

      // Verify accessible SVG element
      const svgMap = screen.getByRole("img", { name: /world map ground track/i });
      expect(svgMap).toBeInTheDocument();

      // Verify screen-reader caption for ground stations table
      const caption = screen.getByText(/ground station network link and elevation status/i);
      expect(caption).toBeInTheDocument();

      // Verify sub-satellite coordinates display
      expect(screen.getByText(/sub-sat: 33.7°s, 150.3°e/i)).toBeInTheDocument();
    });

    it("provides interactive keyboard accessible targets and station cones", () => {
      const onSelectStation = vi.fn();
      const onSelectTarget = vi.fn();

      render(
        <AccessibleMissionMap
          orbital={{
            altitude_km: 550.0,
            velocity_km_s: 7.58,
            latitude_deg: 0.0,
            longitude_deg: 0.0,
            in_eclipse: false,
            true_anomaly_deg: 0.0,
          } as any}
          scenarioId="wildfire"
          onSelectStation={onSelectStation}
          onSelectTarget={onSelectTarget}
        />
      );

      // Ground station buttons with descriptive aria-labels
      const stationButtons = screen.getAllByRole("button", { name: /ground station/i });
      expect(stationButtons.length).toBeGreaterThan(0);

      // Trigger selection
      fireEvent.click(stationButtons[0]);
      expect(onSelectStation).toHaveBeenCalled();
    });
  });

  describe("Non-Color-Only Indicators & Warnings", () => {
    it("renders WarningPanel with distinct glyphs and textual severity labels", () => {
      const warnings: Warning[] = [
        { id: "w1", level: "critical", message: "Battery SoC below critical reserve (8.5%)" },
        { id: "w2", level: "warning", message: "Onboard flash buffer 88% full" },
        { id: "w3", level: "info", message: "Acquiring Svalbard ground station pass" },
      ];

      render(<WarningPanel warnings={warnings} />);

      // Verify role="alert"
      const alertRegion = screen.getByRole("alert");
      expect(alertRegion).toBeInTheDocument();

      // Verify non-color textual prefixes and icons
      expect(screen.getByText("[CRITICAL]")).toBeInTheDocument();
      expect(screen.getByText("⛔")).toBeInTheDocument();
      expect(screen.getByText("[CAUTION]")).toBeInTheDocument();
      expect(screen.getAllByText("⚠️").length).toBeGreaterThan(0);
      expect(screen.getByText("[INFO]")).toBeInTheDocument();
      expect(screen.getByText("ℹ️")).toBeInTheDocument();

      // Verify message text
      expect(screen.getByText(/battery soc below critical reserve/i)).toBeInTheDocument();
    });

    it("renders nominal WarningPanel state with checkmark when no warnings active", () => {
      render(<WarningPanel warnings={[]} />);
      const statusBox = screen.getByRole("status");
      expect(statusBox).toBeInTheDocument();
      expect(screen.getByText(/all systems nominal/i)).toBeInTheDocument();
    });

    it("renders StatusBadge with non-color glyphs for accessibility", () => {
      const { rerender } = render(<StatusBadge label="Operational" variant="success" />);
      expect(screen.getByText("✓")).toBeInTheDocument();
      expect(screen.getByText("Operational")).toBeInTheDocument();

      rerender(<StatusBadge label="Degraded" variant="warning" />);
      expect(screen.getByText("▲")).toBeInTheDocument();

      rerender(<StatusBadge label="Offline" variant="danger" />);
      expect(screen.getByText("✕")).toBeInTheDocument();
    });
  });

  describe("Performance & Bounded DOM Rendering", () => {
    it("bounds activity feed and recent actions to avoid DOM explosion on low-end laptops", () => {
      // Generate 50 feed items
      const heavyFeed = Array.from({ length: 50 }, (_, i) => `Telemetry packet line #${i + 1}`);

      // Generate 20 recent actions
      const heavyActions: ActionAuditEntry[] = Array.from({ length: 20 }, (_, i) => ({
        actor: `Pilot-${i}`,
        role: "SystemsEngineer",
        actionType: "SET_POWER_MODE",
        timestamp: "12:00:00",
        result: i % 2 === 0 ? "ACCEPTED" : "REJECTED",
      }));

      const mockParticipants = [
        {
          player_id: "p1",
          display_name: "Cadet One",
          is_host: true,
          ready: true,
          connected: true,
          roles: ["systems_engineer"],
        },
      ];

      render(
        <ParticipantList
          participants={mockParticipants}
          feed={heavyFeed}
          recentActions={heavyActions}
        />
      );

      // Verify that the feed list is sliced to max 8 items
      const renderedFeedItems = screen.getAllByText(/telemetry packet line #/i);
      expect(renderedFeedItems.length).toBeLessThanOrEqual(8);

      // Verify that recent actions list is sliced to max 4 items
      const renderedActionItems = screen.getAllByText(/SET_POWER_MODE/i);
      expect(renderedActionItems.length).toBeLessThanOrEqual(4);
    });
  });
});

