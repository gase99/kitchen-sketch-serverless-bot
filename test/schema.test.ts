import { describe, expect, it } from "vitest";
import { applyDimensionEdits, looksLikeDimensionEdit, normalizeSketch, SketchValidationError } from "../src/domain/schema";
import { buildPlan } from "../src/domain/plan";
import { sampleSketch } from "./helpers";

describe("normalizeSketch", () => {
  it("accepts a valid sketch and computes the plan", () => {
    const s = sampleSketch();
    const plan = buildPlan(s);
    expect(plan.area).toBeCloseTo(10.8);
    expect(plan.walls.every((w) => w.innerCornerAtStart && w.innerCornerAtEnd)).toBe(true);
    expect(plan.walls[0].inward).toEqual([-0, 1]);
  });

  it("closes a polygon whose dimensions do not add up and records a note", () => {
    const s = normalizeSketch({
      walls: [
        { id: "W1", length: "350", direction: "east" },
        { id: "W2", length: 300, direction: "south" },
        { id: "W3", length: 340, direction: "west" },
        { id: "W4", length: 300, direction: "north" },
      ],
      openings: [{ id: "D1", type: "door", wallId: "W9", offset: 0, width: 90 }],
    });
    expect(s.walls[2].length).toBe(350);
    expect(s.notes.join()).toMatch(/W3 adjusted/);
    expect(s.openings).toHaveLength(0);
    expect(s.ceilingHeight).toBe(270);
  });

  it("merges collinear walls and handles an L-shaped room", () => {
    const s = normalizeSketch({
      walls: [
        { id: "W1", length: 200, direction: "east" },
        { id: "W1b", length: 100, direction: "east" },
        { id: "W2", length: 200, direction: "south" },
        { id: "W3", length: 100, direction: "west" },
        { id: "W4", length: 100, direction: "south" },
        { id: "W5", length: 200, direction: "west" },
        { id: "W6", length: 300, direction: "north" },
      ],
    });
    expect(s.walls).toHaveLength(6);
    expect(s.walls[0].length).toBe(300);
    const plan = buildPlan(s);
    expect(plan.walls.filter((w) => !w.innerCornerAtEnd)).toHaveLength(1);
    expect(plan.area).toBeCloseTo(8);
  });

  it("rejects non-orthogonal or degenerate input", () => {
    expect(() => normalizeSketch({ walls: [{ id: "W1", length: 100, direction: "east" }] })).toThrow(SketchValidationError);
    expect(() =>
      normalizeSketch({
        walls: [
          { id: "W1", length: 100, direction: "east" },
          { id: "W2", length: 100, direction: "west" },
          { id: "W3", length: 100, direction: "east" },
          { id: "W4", length: 100, direction: "west" },
        ],
      }),
    ).toThrow(SketchValidationError);
  });
});

describe("dimension edits", () => {
  it("parses Latin and Persian digits and keeps the room closed", () => {
    const s = sampleSketch();
    expect(looksLikeDimensionEdit("W1=۴۰۰ H=260")).toBe(true);
    expect(looksLikeDimensionEdit("the window is on W2")).toBe(false);
    expect(applyDimensionEdits(s, "W1=۴۰۰ H=260")).toEqual(["W1", "H"]);
    expect(s.walls[0].length).toBe(400);
    expect(s.walls[2].length).toBe(400);
    expect(s.ceilingHeight).toBe(260);
  });
});
