import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "../components/Button";
import { Tabs } from "../components/Tabs";

describe("Button Component", () => {
  it("renders with children text", () => {
    render(<Button>Launch Mission</Button>);
    expect(screen.getByRole("button", { name: /launch mission/i })).toBeInTheDocument();
  });

  it("handles clicks", () => {
    let clicked = false;
    render(<Button onClick={() => { clicked = true; }}>Click Me</Button>);
    fireEvent.click(screen.getByRole("button", { name: /click me/i }));
    expect(clicked).toBe(true);
  });

  it("respects disabled attribute", () => {
    render(<Button disabled>Disabled Button</Button>);
    expect(screen.getByRole("button", { name: /disabled button/i })).toBeDisabled();
  });
});

describe("Tabs Component", () => {
  const mockTabs = [
    { id: "tab1", label: "Station 1" },
    { id: "tab2", label: "Station 2" },
  ];

  it("renders tabs correctly and switches active tab on click", () => {
    render(
      <Tabs tabs={mockTabs}>
        <div>Tab Content</div>
      </Tabs>
    );

    const tab1 = screen.getByRole("tab", { name: /station 1/i });
    const tab2 = screen.getByRole("tab", { name: /station 2/i });

    expect(tab1).toHaveAttribute("aria-selected", "true");
    expect(tab2).toHaveAttribute("aria-selected", "false");

    fireEvent.click(tab2);
    expect(tab2).toHaveAttribute("aria-selected", "true");
  });
});

