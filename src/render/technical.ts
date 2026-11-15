import type { KitchenLayout } from "../domain/layout";
import { buildPlan } from "../domain/plan";
import type { KitchenSketch } from "../domain/schema";
import { renderSvg } from "./svg";

const esc = (s: string) => s.replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" })[c]!);

/** Creates a printable concept sheet: dimensioned plan, wall elevation and schematic axonometric. */
export function renderTechnicalSvg(sketch: KitchenSketch, layout: KitchenLayout): string {
  const plan = buildPlan(sketch);
  const planSvg = renderSvg(sketch, layout, "Dimensioned cabinet plan");
  const viewBox = planSvg.match(/<svg[^>]*viewBox="([^"]+)"/)?.[1] ?? "0 0 1000 700";
  const inner = planSvg.replace(/^.*?<svg[^>]*>/s, "").replace(/<\/svg>\s*$/s, "");
  const primary = layout.wallIds[Math.floor(layout.wallIds.length / 2)];
  const wall = sketch.walls.find((w) => w.id === primary) ?? sketch.walls[0];
  const units = layout.units.filter((u) => u.wallId === wall.id).sort((a, b) => a.offset - b.offset);
  const scale = Math.min(650 / Math.max(wall.length, 1), 0.8);
  const left = 850;
  const baseline = 700;
  const x0 = left + 55;
  const wallWidth = wall.length * scale;
  const elevation: string[] = [];
  elevation.push(`<text x="${left}" y="115" class="h">نمای دیوار ${esc(wall.id)} · طول ${wall.length} cm</text>`);
  elevation.push(`<line x1="${x0}" y1="${baseline}" x2="${x0 + wallWidth}" y2="${baseline}" class="line"/>`);
  elevation.push(`<line x1="${x0}" y1="${baseline - 1}" x2="${x0}" y2="${baseline - 210 * scale}" class="thin"/>`);
  for (const u of units) {
    if (u.kind === "wall") continue;
    const x = x0 + u.offset * scale;
    const w = u.width * scale;
    const h = (u.kind === "tall" ? u.height : u.height) * scale;
    const y = baseline - h;
    const fill = u.kind === "tall" ? "#dce2f5" : "#f3e3c4";
    elevation.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" class="cab" fill="${fill}"/>`);
    elevation.push(`<line x1="${x + w * .5}" y1="${y + 5}" x2="${x + w * .5}" y2="${baseline - 5}" class="thin"/>`);
    elevation.push(`<text x="${x + w/2}" y="${y + h/2}" class="label" text-anchor="middle">${esc(u.type)} ${u.width}</text>`);
  }
  // Wall cabinets are represented above the counter, with their actual footprint widths and a clear schematic disclaimer.
  for (const u of units.filter((item) => item.kind === "wall")) {
    const x = x0 + u.offset * scale;
    const w = u.width * scale;
    const y = baseline - 210 * scale - u.height * scale;
    elevation.push(`<rect x="${x}" y="${y}" width="${w}" height="${u.height * scale}" class="wallcab"/>`);
    elevation.push(`<line x1="${x + w/2}" y1="${y + 4}" x2="${x + w/2}" y2="${y + u.height*scale - 4}" class="thin"/>`);
  }
  elevation.push(`<line x1="${x0}" y1="${baseline + 34}" x2="${x0 + wallWidth}" y2="${baseline + 34}" class="dim"/><line x1="${x0}" y1="${baseline + 25}" x2="${x0}" y2="${baseline + 43}" class="dim"/><line x1="${x0 + wallWidth}" y1="${baseline + 25}" x2="${x0 + wallWidth}" y2="${baseline + 43}" class="dim"/><text x="${x0 + wallWidth/2}" y="${baseline + 57}" class="label" text-anchor="middle">${wall.length} cm</text>`);

  // Axonometric block diagram is intentionally schematic (not a photorealistic rendering).
  const axo: string[] = [`<text x="850" y="835" class="h">نمای حجمی شماتیک · برای درک کلی چیدمان</text>`];
  const startX = 900, startY = 1010, unitScale = 0.52, depX = 110, depY = -62;
  for (const [i, wid] of layout.wallIds.entries()) {
    const row = i === 0 ? 0 : i === 1 ? 1 : 2;
    const selectedUnits = layout.units.filter((u) => u.wallId === wid && u.kind !== "wall");
    let cursor = 0;
    for (const u of selectedUnits) {
      const xx = startX + cursor * unitScale + (row === 1 ? depX : row === 2 ? depX * 2 : 0);
      const yy = startY + (row === 1 ? depY : row === 2 ? depY * 2 : 0);
      const w = u.width * unitScale, h = Math.min(u.height * unitScale, 120), d = 42;
      axo.push(`<polygon points="${xx},${yy-h} ${xx+d},${yy-h-22} ${xx+d+w},${yy-h-22} ${xx+w},${yy-h}" fill="#ead7b5" stroke="#66563f"/>`);
      axo.push(`<polygon points="${xx+w},${yy-h} ${xx+d+w},${yy-h-22} ${xx+d+w},${yy-22} ${xx+w},${yy}" fill="#cbb58f" stroke="#66563f"/>`);
      axo.push(`<rect x="${xx}" y="${yy-h}" width="${w}" height="${h}" fill="#f2e4cc" stroke="#66563f"/>`);
      cursor += u.width;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1180" width="1600" height="1180" font-family="Arial,Tahoma,sans-serif">
  <style>.h{font-size:24px;font-weight:bold;fill:#222}.label{font-size:12px;fill:#333}.line{stroke:#333;stroke-width:2}.thin{stroke:#777;stroke-width:1}.dim{stroke:#555;stroke-width:1.5}.cab{stroke:#66563f;stroke-width:2}.wallcab{fill:#dae8df;stroke:#3d7a5a;stroke-width:2}</style>
  <rect width="1600" height="1180" fill="white"/><rect x="18" y="18" width="1564" height="1144" fill="none" stroke="#333" stroke-width="2"/>
  <text x="45" y="62" class="h">Kitchen concept &amp; technical layout · ${layout.shape} · ${plan.area.toFixed(1)} m²</text>
  <text x="45" y="91" class="label">All dimensions in cm · ceiling ${sketch.ceilingHeight} · cabinet modules are schematic; verify on site before manufacture</text>
  <rect x="30" y="110" width="780" height="870" fill="none" stroke="#aaa"/><text x="50" y="140" class="h">Dimensioned plan</text>
  <svg x="38" y="155" width="760" height="805" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${inner}</svg>
  <rect x="825" y="110" width="745" height="650" fill="none" stroke="#aaa"/>${elevation.join("")}
  <rect x="825" y="785" width="745" height="345" fill="none" stroke="#aaa"/>${axo.join("")}
  <text x="48" y="1040" class="label">Suggested cabinets: ${layout.units.length} modules · counter run ${layout.counterLength} cm · plan confidence ${Math.round(sketch.confidence*100)}%</text>
  <text x="48" y="1070" class="label">This concept sheet is generated from image analysis. Confirm every dimension, opening, utility point and appliance clearance before ordering.</text>
  <text x="48" y="1100" class="label">Doors, windows and utilities are only shown when detected or supplied by the user; perspective is schematic, not a construction drawing.</text>
  </svg>`;
}
