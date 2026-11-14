import { describe, expect, it } from "vitest";
import { generateLayout } from "../src/domain/layout";
import { renderSvg } from "../src/render/svg";
import { sampleSketch } from "./helpers";

describe("renderSvg", () => {
  it("renders a standalone wall plan", () => {
    const svg = renderSvg(sampleSketch(), undefined, "Plan <test>");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("W1 = 360 cm");
    expect(svg).toContain("Plan &lt;test&gt;");
    expect(svg).not.toContain("NaN");
  });

  it("renders the layout on top of the plan", () => {
    const sketch = sampleSketch();
    const svg = renderSvg(sketch, generateLayout(sketch, "L"));
    expect(svg).toContain("DW60");
    expect(svg).toContain("F60");
    expect(svg).not.toContain("NaN");
  });
});
