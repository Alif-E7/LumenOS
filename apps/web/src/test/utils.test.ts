import { describe, it, expect } from "vitest";
import { cn, formatDuration, formatValue, clamp, generateId } from "../lib/utils";

describe("Frontend Utilities", () => {
  it("cn merges class names properly", () => {
    expect(cn("px-4", "py-2", false && "hidden", "text-white")).toBe("px-4 py-2 text-white");
    expect(cn("base", undefined, null, "active")).toBe("base active");
  });

  it("formatDuration formats seconds accurately", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(65)).toBe("1m 5s");
    expect(formatDuration(3665)).toBe("1h 1m 5s");
  });

  it("formatValue adds commas and unit", () => {
    expect(formatValue(1000, "km")).toBe("1,000 km");
    expect(formatValue(1234.567, "kg", 2)).toBe("1,234.57 kg");
  });

  it("clamp restricts values to boundaries", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("generateId creates prefixed unique ids", () => {
    const id1 = generateId("player");
    const id2 = generateId("player");
    expect(id1.startsWith("player_")).toBe(true);
    expect(id1).not.toBe(id2);
  });
});

