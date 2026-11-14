// Renders examples/*.svg from examples/sample-sketch.json (no Telegram / AI needed).
// Usage: npm run render:sample
import { readFileSync, writeFileSync } from "node:fs";
import { generateLayout, type LayoutShape } from "../src/domain/layout";
import { normalizeSketch } from "../src/domain/schema";
import { renderSvg } from "../src/render/svg";

const input = process.argv[2] ?? "examples/sample-sketch.json";
const sketch = normalizeSketch(JSON.parse(readFileSync(input, "utf8")));
writeFileSync("examples/plan.svg", renderSvg(sketch, undefined, "Wall plan"));
for (const shape of ["auto", "linear", "L", "U"] as LayoutShape[]) {
  const layout = generateLayout(sketch, shape);
  writeFileSync(`examples/layout-${shape}.svg`, renderSvg(sketch, layout, `Layout (${shape})`));
  console.log(shape, "->", layout.shape, layout.wallIds.join(","), `${layout.units.length} units`, layout.warnings);
}
