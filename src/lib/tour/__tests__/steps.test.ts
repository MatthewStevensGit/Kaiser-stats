import { describe, expect, it } from "vitest";
import { ADMIN_TOUR_STEPS, GENERAL_TOUR_STEPS } from "../steps";

describe("tour steps", () => {
  it("every general step has a unique id", () => {
    const ids = GENERAL_TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every admin step has a unique id", () => {
    const ids = ADMIN_TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("general and admin step ids never collide", () => {
    const generalIds = new Set(GENERAL_TOUR_STEPS.map((s) => s.id));
    const overlap = ADMIN_TOUR_STEPS.filter((s) => generalIds.has(s.id));
    expect(overlap).toEqual([]);
  });

  it("neither list is empty", () => {
    expect(GENERAL_TOUR_STEPS.length).toBeGreaterThan(0);
    expect(ADMIN_TOUR_STEPS.length).toBeGreaterThan(0);
  });
});
