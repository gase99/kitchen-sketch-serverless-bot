import { describe, expect, it } from "vitest";
import { billOfMaterials, generateLayout, pickModules, type KitchenLayout } from "../src/domain/layout";
import { sampleSketch } from "./helpers";

function overlaps(layout: KitchenLayout) {
  const floor = layout.units.filter((u) => u.kind !== "wall");
  for (const a of floor)
    for (const b of floor)
      if (a !== b && a.wallId === b.wallId && a.offset < b.offset + b.width && b.offset < a.offset + a.width) return [a, b];
  return null;
}

describe("generateLayout", () => {
  const sketch = sampleSketch();

  it.each(["auto", "linear", "L", "U"] as const)("produces a valid %s layout", (shape) => {
    const layout = generateLayout(sketch, shape);
    expect(overlaps(layout)).toBeNull();
    for (const u of layout.units) {
      const wall = sketch.walls.find((w) => w.id === u.wallId)!;
      expect(u.offset).toBeGreaterThanOrEqual(0);
      expect(u.offset + u.width).toBeLessThanOrEqual(wall.length);
    }
    const types = layout.units.map((u) => u.type);
    expect(types).toContain("sink");
    expect(types).toContain("hob");
  });

  it("puts the sink under the window and the hob at the gas point", () => {
    const layout = generateLayout(sketch, "U");
    const sink = layout.units.find((u) => u.type === "sink")!;
    expect(sink.wallId).toBe("W1");
    expect(sink.offset).toBeGreaterThanOrEqual(120);
    expect(sink.offset + sink.width).toBeLessThanOrEqual(240);
    const hob = layout.units.find((u) => u.type === "hob")!;
    expect(hob.wallId).toBe("W2");
    expect(Math.abs(hob.offset + hob.width / 2 - 150)).toBeLessThanOrEqual(30);
    expect(layout.units.some((u) => u.type === "hood" && u.offset === hob.offset)).toBe(true);
  });

  it("keeps doors and their swing area free", () => {
    const layout = generateLayout(sketch, "U");
    // D1 is on W3 at offset 40..130, i.e. right next to the W2/W3 corner: W2's last 90+ cm must stay empty.
    const w2 = layout.units.filter((u) => u.wallId === "W2" && u.kind !== "wall");
    expect(Math.max(...w2.map((u) => u.offset + u.width))).toBeLessThanOrEqual(300 - 90);
  });

  it("uses a blind corner unit where two runs meet", () => {
    const layout = generateLayout(sketch, "L");
    expect(layout.units.filter((u) => u.type === "corner")).toHaveLength(1);
  });

  it("does not place wall cabinets over the window", () => {
    const layout = generateLayout(sketch, "linear");
    const wallCabs = layout.units.filter((u) => u.kind === "wall" && u.wallId === "W1" && u.type !== "hood");
    expect(wallCabs.length).toBeGreaterThan(0);
    for (const u of wallCabs) expect(u.offset + u.width <= 120 || u.offset >= 240).toBe(true);
  });

  it("falls back when a shape is impossible", () => {
    const narrow = sampleSketch();
    narrow.openings.push({ id: "D2", type: "door", wallId: "W4", offset: 20, width: 260 });
    narrow.openings.push({ id: "D3", type: "door", wallId: "W2", offset: 20, width: 260 });
    const layout = generateLayout(narrow, "U");
    expect(layout.shape).toBe("linear");
    expect(layout.warnings).toContain("U_NOT_POSSIBLE");
  });

  it("builds a bill of materials", () => {
    const bom = billOfMaterials(generateLayout(sketch, "auto"));
    expect(bom.find((r) => r.type === "sink")?.count).toBe(1);
    expect(bom[0].kind).toBe("base");
  });
});

describe("pickModules", () => {
  it("fills a run with standard widths", () => {
    expect(pickModules(120)).toEqual([60, 60]);
    expect(pickModules(150).reduce((a, b) => a + b, 0)).toBe(150);
    expect(pickModules(25)).toEqual([]);
  });
});
