import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ParticipantList } from "../components/ParticipantList";
import type { ParticipantInfo } from "../types";

const mockParticipants: ParticipantInfo[] = [
  {
    player_id: "p1",
    display_name: "Commander Shepard",
    is_host: true,
    ready: true,
    connected: true,
    roles: ["mission_director"],
  },
  {
    player_id: "p2",
    display_name: "Kaylee Frye",
    is_host: false,
    ready: true,
    connected: true,
    roles: ["systems_engineer"],
  },
  {
    player_id: "p3",
    display_name: "Spock",
    is_host: false,
    ready: true,
    connected: true,
    roles: ["science_officer"],
  },
  {
    player_id: "p4",
    display_name: "Joker",
    is_host: false,
    ready: false,
    connected: false,
    roles: ["flight_controller"],
  },
];

const mockRoles: Record<string, string[]> = {
  p1: ["mission_director"],
  p2: ["systems_engineer"],
  p3: ["science_officer"],
  p4: ["flight_controller"],
};

const mockPendingRequests = [
  {
    id: "req_01",
    requesterId: "p3",
    requesterName: "Spock",
    role: "systems_engineer" as const,
    actionType: "set_power_mode",
    description: "Requesting ECO profile for observation sensor margin",
    timestamp: "12:00:00",
  },
];

const mockRecentActions = [
  {
    actor: "Kaylee Frye",
    role: "systems_engineer",
    actionType: "adjust_thermal",
    timestamp: "11:59:00",
    result: "ACCEPTED" as const,
  },
];

const mockFeed = [
  "Spock requested systems_engineer for set_power_mode",
  "Kaylee Frye: adjust_thermal accepted",
  "Joker disconnected (holding slot)",
];

describe("Prompt 14 — Cooperative Multiplayer Stations, Roles & Synchronization", () => {
  it("renders 4-player crew roster with four distinct roles and connection badges", () => {
    render(
      <ParticipantList
        participants={mockParticipants}
        selfId="p1"
        roles={mockRoles}
      />
    );

    expect(screen.getByText(/Commander Shepard/i)).toBeInTheDocument();
    expect(screen.getByText(/\(you\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Host/i)).toBeInTheDocument();

    expect(screen.getByText(/Kaylee Frye/i)).toBeInTheDocument();
    expect(screen.getByText(/Spock/i)).toBeInTheDocument();
    expect(screen.getByText(/Joker/i)).toBeInTheDocument();
    expect(screen.getByText(/DISCONNECTED/i)).toBeInTheDocument();

    // Verify all four stations are badged
    expect(screen.getByText(/Mission Director/i)).toBeInTheDocument();
    expect(screen.getByText(/Systems Engineer/i)).toBeInTheDocument();
    expect(screen.getByText(/Science Officer/i)).toBeInTheDocument();
    expect(screen.getByText(/Flight Controller/i)).toBeInTheDocument();
  });

  it("renders quick tactical coordination pings and fires callbacks", () => {
    const handlePing = vi.fn();

    render(
      <ParticipantList
        participants={mockParticipants}
        selfId="p1"
        roles={mockRoles}
        onSendTacticalPing={handlePing}
      />
    );

    expect(screen.getByText(/Tactical Coordination Pings/i)).toBeInTheDocument();

    const needPowerBtn = screen.getByRole("button", { name: /Need Power/i });
    fireEvent.click(needPowerBtn);

    expect(handlePing).toHaveBeenCalledWith(
      "NEED_POWER",
      "Requesting additional power allocation"
    );

    const stationPassBtn = screen.getByRole("button", { name: /Station Pass/i });
    fireEvent.click(stationPassBtn);

    expect(handlePing).toHaveBeenCalledWith(
      "STATION_PASS",
      "Ground station contact in <60s"
    );
  });

  it("renders pending cross-role action requests and allows Director or target role to approve", () => {
    const handleApprove = vi.fn();
    const handleReject = vi.fn();

    render(
      <ParticipantList
        participants={mockParticipants}
        selfId="p1"
        roles={mockRoles}
        pendingRequests={mockPendingRequests}
        canApprove={true}
        onApproveRequest={handleApprove}
        onRejectRequest={handleReject}
      />
    );

    expect(screen.getByText(/Pending Action Authorizations/i)).toBeInTheDocument();
    expect(screen.getByText(/Requesting ECO profile for observation sensor margin/i)).toBeInTheDocument();

    const approveBtn = screen.getByRole("button", { name: /Approve/i });
    const rejectBtn = screen.getByRole("button", { name: /Reject/i });

    fireEvent.click(approveBtn);
    expect(handleApprove).toHaveBeenCalledWith("req_01");

    fireEvent.click(rejectBtn);
    expect(handleReject).toHaveBeenCalledWith("req_01");
  });

  it("renders real-time team activity feed and command audit log", () => {
    render(
      <ParticipantList
        participants={mockParticipants}
        selfId="p1"
        roles={mockRoles}
        recentActions={mockRecentActions}
        feed={mockFeed}
      />
    );

    expect(screen.getByText(/Team Activity & Command Audit Feed/i)).toBeInTheDocument();
    expect(screen.getByText(/Spock requested systems_engineer for set_power_mode/i)).toBeInTheDocument();
    expect(screen.getByText(/Joker disconnected \(holding slot\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/adjust_thermal/i).length).toBeGreaterThan(0);
    expect(screen.getByText("ACCEPTED")).toBeInTheDocument();
  });
});
