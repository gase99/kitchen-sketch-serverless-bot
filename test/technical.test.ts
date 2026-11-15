import { describe, expect, it } from "vitest";
import { generateLayout } from "../src/domain/layout";
import { renderTechnicalSvg } from "../src/render/technical";
import { sampleSketch } from "./helpers";

describe("technical sheet", () => {
  it("renders a printable plan, wall elevation, and schematic axonometric", () => {
    const sketch = sampleSketch();
    const svg = renderTechnicalSvg(sketch, generateLayout(sketch));
    expect(svg).toContain("Dimensioned plan");
    expect(svg).toContain("نمای دیوار");
    expect(svg).toContain("نمای حجمی شماتیک");
    expect(svg).toContain("verify on site before manufacture");
    expect(svg.match(/<svg/g)).toHaveLength(2);
  });
});
