import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import { RewardsPage } from "../pages/RewardsPage";
import * as client from "../api/client";
import type { PlayerProfileResponse, MissionBrief } from "../types";

vi.mock("../api/client");

const mockMissions: MissionBrief[] = [
  {
    id: "wildfire",
    name: "Wildfire Scout",
    codename: "Eyes on Fire",
    description: "Detect and prioritize fire/thermal anomalies.",
    difficulty: 2,
    icon: "🔥",
    recommended_payload: "Thermal Infrared Camera",
    orbit_altitude_km: 550,
    orbit_inclination_deg: 97.6,
    duration_hours: 24,
    tags: ["Thermal", "Wildfire"],
  },
  {
    id: "flood",
    name: "Flood Scout",
    codename: "Rising Waters",
    description: "Map affected areas with SAR radar.",
    difficulty: 3,
    icon: "🌊",
    recommended_payload: "Synthetic Aperture Radar",
    orbit_altitude_km: 600,
    orbit_inclination_deg: 98.2,
    duration_hours: 48,
    tags: ["Radar", "Flood"],
  },
  {
    id: "solar_storm",
    name: "Solar Storm Sentinel",
    codename: "Watch the Sun",
    description: "Monitor solar activity and survive coronal mass ejections.",
    difficulty: 4,
    icon: "☀️",
    recommended_payload: "EUV Spectrometer",
    orbit_altitude_km: 700,
    orbit_inclination_deg: 98.6,
    duration_hours: 72,
    tags: ["Space Weather", "Solar"],
  },
  {
    id: "volcano",
    name: "Volcano Watch",
    codename: "Fire Beneath the Earth",
    description: "Track volcanic eruption plumes and sulfur dioxide emissions.",
    difficulty: 4,
    icon: "🌋",
    recommended_payload: "Multispectral Plume Imager",
    orbit_altitude_km: 500,
    orbit_inclination_deg: 97.4,
    duration_hours: 36,
    tags: ["Plumes", "Volcano"],
  },
];

const mockProfile: PlayerProfileResponse = {
  player_id: "pilot-local",
  display_name: "Veteran Flight Director",
  total_xp: 950,
  level: 3,
  xp_to_next_level: 50,
  engineering_credits: 1200,
  missions_completed: 4,
  achievements: [
    {
      id: "first_launch",
      name: "First Launch",
      description: "Complete your first mission.",
      category: "mission",
      icon: "🚀",
      xp_reward: 50,
      credit_reward: 100,
      unlocked: true,
      unlock_date: "2026-11-08",
      progress_value: 1.0,
      target_value: 1.0,
    },
    {
      id: "perfect_score",
      name: "Perfect Score",
      description: "Earn an A+ grade on any mission.",
      category: "mastery",
      icon: "⭐",
      xp_reward: 500,
      credit_reward: 500,
      unlocked: true,
      unlock_date: "2026-11-08",
      progress_value: 1.0,
      target_value: 1.0,
    },
  ],
  unlocks: [
    {
      id: "high_density_battery",
      name: "High-Density Li-Sulfur Battery",
      description: "Advanced energy storage yielding +40% capacity for eclipse operations.",
      unlock_type: "spacecraft_module",
      credit_cost: 350,
      required_level: 2,
      icon: "🔋",
      unlocked: true,
    },
    {
      id: "optical_sar_sensor",
      name: "Dual-Polarized SAR Array",
      description: "High-resolution imaging radar with cloud penetration capabilities.",
      unlock_type: "spacecraft_module",
      credit_cost: 650,
      required_level: 3,
      icon: "📡",
      unlocked: false,
    },
  ],
  campaign: {
    unlocked_missions: ["wildfire", "flood", "solar_storm", "volcano"],
    mission_records: {},
  },
};

describe("Prompt 16 — Full Product Integration & Player Journeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.listMissions).mockResolvedValue(mockMissions);
    vi.mocked(client.getPlayerProfile).mockResolvedValue(mockProfile);
    vi.mocked(client.purchaseUnlock).mockResolvedValue({
      success: true,
      unlock_id: "optical_sar_sensor",
      remaining_credits: 550,
      unlocked: ["high_density_battery", "optical_sar_sensor"],
    });
  });

  it("navigates from Mode Select to Solo Missions journey and displays all 4 scenarios", async () => {
    render(
      <MemoryRouter initialEntries={["/mode"]}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: /choose your mission mode/i })).toBeInTheDocument();
    const soloBtn = screen.getByRole("button", { name: /start solo mission/i });
    expect(soloBtn).toBeInTheDocument();
    fireEvent.click(soloBtn);

    // After clicking Solo, user is navigated to /missions and sees all 4 scenarios
    expect(await screen.findByRole("heading", { name: /mission scenarios/i })).toBeInTheDocument();
    expect(await screen.findByText("Wildfire Scout")).toBeInTheDocument();
    expect(screen.getByText("Flood Scout")).toBeInTheDocument();
    expect(screen.getByText("Solar Storm Sentinel")).toBeInTheDocument();
    expect(screen.getByText("Volcano Watch")).toBeInTheDocument();
  });

  it("renders RewardsPage with persistent profile, zero mock badges, and purchase CTA", async () => {
    render(
      <MemoryRouter>
        <RewardsPage />
      </MemoryRouter>
    );

    // Verify title and profile ID
    expect(await screen.findByText(/rewards & career progression/i)).toBeInTheDocument();
    expect(screen.getByText(/PROFILE ID: pilot-local/i)).toBeInTheDocument();

    // Verify NO mock data badge is rendered
    expect(screen.queryByText(/badge unlock history is not persisted yet/i)).toBeNull();
    expect(screen.queryByText(/server-side profiles are not implemented yet/i)).toBeNull();

    // Verify Real Stats & Rank
    expect(screen.getByText("Veteran Flight Director")).toBeInTheDocument();
    expect(screen.getByText("1,200 Credits")).toBeInTheDocument();
    expect(screen.getByText("950 / 1,000 XP")).toBeInTheDocument();

    // Verify Unlocks Store
    expect(screen.getByText("High-Density Li-Sulfur Battery")).toBeInTheDocument();
    expect(screen.getByText("Dual-Polarized SAR Array")).toBeInTheDocument();
    expect(screen.getByText("UNLOCKED")).toBeInTheDocument();

    // Click Unlock button for SAR array
    const unlockBtn = screen.getByRole("button", { name: /unlock \(650 cr\)/i });
    expect(unlockBtn).toBeInTheDocument();
    fireEvent.click(unlockBtn);

    await waitFor(() => {
      expect(client.purchaseUnlock).toHaveBeenCalledWith("pilot-local", "optical_sar_sensor");
    });
  });

  it("supports Co-op multiplayer lobby flow at /coop", () => {
    render(
      <MemoryRouter initialEntries={["/coop"]}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: /cooperative mission room/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create new room/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /join existing room/i })).toBeInTheDocument();
  });
});
