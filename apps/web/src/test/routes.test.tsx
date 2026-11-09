import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "../App";

describe("Route & Navigation Acceptance Checks", () => {
  it("renders HomePage at / with Play and Co-op entry points", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );
    // New simplified homepage: hero heading + PLAY button + secondary links
    expect(screen.getByRole("heading", { name: /fly your own satellite/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fly with friends/i })).toBeInTheDocument();
  });

  it("renders ModeSelectPage at /mode", () => {
    render(
      <MemoryRouter initialEntries={["/mode"]}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: /choose your mission mode/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start solo mission/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create room/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /join room/i })).toBeInTheDocument();
  });

  it("renders DataSourcesPage at /sources", () => {
    render(
      <MemoryRouter initialEntries={["/sources"]}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: /data & scientific sources/i })).toBeInTheDocument();
    expect(screen.getByText(/semantic data provenance framework/i)).toBeInTheDocument();
    expect(screen.getByText(/simulation physics engine calibration/i)).toBeInTheDocument();
  });

  it("renders HelpPage at /help", () => {
    render(
      <MemoryRouter initialEntries={["/help"]}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: /flight academy & tutorial/i })).toBeInTheDocument();
    expect(screen.getByText(/the mission loop/i)).toBeInTheDocument();
    expect(screen.getByText(/the four flight deck stations/i)).toBeInTheDocument();
  });

  it("renders SettingsPage at /settings", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: /platform settings/i })).toBeInTheDocument();
    expect(screen.getByText(/default to engineer mode/i)).toBeInTheDocument();
  });

  it("renders CoopLobbyPage at /coop", () => {
    render(
      <MemoryRouter initialEntries={["/coop"]}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: /cooperative mission room/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create new room/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /join existing room/i })).toBeInTheDocument();
  });

  it("renders BenchmarkPage at /benchmark", () => {
    render(
      <MemoryRouter initialEntries={["/benchmark"]}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: /control strategy benchmark/i })).toBeInTheDocument();
    expect(screen.getByText(/fair three-way flight control benchmark harness/i)).toBeInTheDocument();
  });
});

