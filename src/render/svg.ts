import { DIMENSIONS, type KitchenLayout, type PlacedUnit } from "../domain/layout";
import { buildPlan, pointOnWall, type Point, type WallGeometry } from "../domain/plan";
import type { KitchenSketch } from "../domain/schema";

const WALL_T = 15;
const PAD = 90;
const LEGEND_H = 70;

const COLORS = {
  wall: "#2b2b2b",
  floor: "#fbfaf7",
  base: "#f1dfbd",
  baseStroke: "#8a6d3b",
  tall: "#d7dcf5",
  tallStroke: "#4a5699",
  wallCab: "#3d7a5a",
  appliance: "#ffffff",
  door: "#c0392b",
  window: "#2e86de",
  dim: "#555",
};

const LABEL: Record<PlacedUnit["type"], string> = {
  sink: "S",
  dishwasher: "DW",
  hob: "H",
  fridge: "F",
  corner: "C",
  cabinet: "",
  filler: "",
  hood: "HD",
  "wall-cabinet": "",
};

const FIXTURE: Record<string, { c: string; t: string }> = {
  water: { c: "#2e86de", t: "W" },
  drain: { c: "#7f8c8d", t: "D" },
  gas: { c: "#e67e22", t: "G" },
  chimney: { c: "#6d4c41", t: "C" },
};

const f = (n: number) => (Math.round(n * 10) / 10).toString();

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function rectOnWall(g: WallGeometry, along: number, width: number, d0: number, d1: number) {
  const p = pointOnWall(g, along, d0);
  const q = pointOnWall(g, along + width, d1);
  return { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]), h: Math.abs(q[1] - p[1]) };
}

/** Outer wall outline: each corner pushed outwards by WALL_T along both adjacent walls (orthogonal rooms). */
function outerPolygon(walls: WallGeometry[]): Point[] {
  return walls.map((g, i) => {
    const prev = walls[(i - 1 + walls.length) % walls.length];
    return [g.start[0] - (g.inward[0] + prev.inward[0]) * WALL_T, g.start[1] - (g.inward[1] + prev.inward[1]) * WALL_T];
  });
}

const path = (pts: Point[]) => `M${pts.map((p) => `${f(p[0])},${f(p[1])}`).join("L")}Z`;

/**
 * Renders the 2D wall plan, and – when `layout` is given – the cabinet layout on top of it.
 * Output is a standalone SVG (cm user units) that opens in any browser.
 */
export function renderSvg(sketch: KitchenSketch, layout?: KitchenLayout, title = "Kitchen plan"): string {
  const plan = buildPlan(sketch);
  const { minX, minY, maxX, maxY } = plan.bounds;
  const vbX = minX - PAD;
  const vbY = minY - PAD;
  const vbW = maxX - minX + PAD * 2;
  const vbH = maxY - minY + PAD * 2 + LEGEND_H;
  const fs = Math.max(9, Math.min(16, Math.max(vbW, vbH) / 55));
  const geomById = new Map(plan.walls.map((g) => [g.wall.id, g]));
  const out: string[] = [];

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(vbX)} ${f(vbY)} ${f(vbW)} ${f(vbH)}" width="${Math.round(vbW * 2)}" height="${Math.round(vbH * 2)}" font-family="Vazirmatn, Tahoma, Arial, sans-serif" font-size="${f(fs)}">`,
    `<title>${esc(title)}</title>`,
    `<rect x="${f(vbX)}" y="${f(vbY)}" width="${f(vbW)}" height="${f(vbH)}" fill="#fff"/>`,
    `<path d="${path(plan.polygon)}" fill="${COLORS.floor}"/>`,
  );

  if (layout) {
    const order = { base: 0, tall: 1, wall: 2 } as const;
    for (const u of [...layout.units].sort((a, b) => order[a.kind] - order[b.kind])) {
      const g = geomById.get(u.wallId);
      if (g) out.push(renderUnit(g, u, fs));
    }
  }

  out.push(`<path d="${path(outerPolygon(plan.walls))} ${path(plan.polygon)}" fill="${COLORS.wall}" fill-rule="evenodd"/>`);

  for (const o of sketch.openings) {
    const g = geomById.get(o.wallId);
    if (!g) continue;
    const r = rectOnWall(g, o.offset, o.width, -WALL_T - 1, 1);
    out.push(`<rect x="${f(r.x)}" y="${f(r.y)}" width="${f(r.w)}" height="${f(r.h)}" fill="#fff"/>`);
    if (o.type === "window") {
      for (const d of [-WALL_T * 0.66, -WALL_T * 0.33]) {
        const a = pointOnWall(g, o.offset, d);
        const b = pointOnWall(g, o.offset + o.width, d);
        out.push(`<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${COLORS.window}" stroke-width="2"/>`);
      }
      const fr = rectOnWall(g, o.offset, o.width, -WALL_T, 0);
      out.push(`<rect x="${f(fr.x)}" y="${f(fr.y)}" width="${f(fr.w)}" height="${f(fr.h)}" fill="none" stroke="${COLORS.window}" stroke-width="1.5"/>`);
    } else {
      // Door leaf + swing arc into the room, hinged at the opening start.
      const hinge = pointOnWall(g, o.offset, 0);
      const leafEnd = pointOnWall(g, o.offset, o.width);
      const closed = pointOnWall(g, o.offset + o.width, 0);
      out.push(
        `<line x1="${f(hinge[0])}" y1="${f(hinge[1])}" x2="${f(leafEnd[0])}" y2="${f(leafEnd[1])}" stroke="${COLORS.door}" stroke-width="2.5"/>`,
        `<path d="M${f(leafEnd[0])},${f(leafEnd[1])} A${f(o.width)},${f(o.width)} 0 0 1 ${f(closed[0])},${f(closed[1])}" fill="none" stroke="${COLORS.door}" stroke-width="1" stroke-dasharray="4 3"/>`,
      );
      const mid = pointOnWall(g, o.offset + o.width / 2, o.width / 2);
      out.push(`<text x="${f(mid[0])}" y="${f(mid[1])}" fill="${COLORS.door}" text-anchor="middle" dominant-baseline="middle">${esc(o.id)}</text>`);
    }
    const lbl = pointOnWall(g, o.offset + o.width / 2, -WALL_T - fs * 0.9);
    out.push(textAlong(g, lbl, `${o.id} ${o.width}`, fs * 0.8, o.type === "door" ? COLORS.door : COLORS.window));
  }

  for (const fx of sketch.fixtures) {
    const g = geomById.get(fx.wallId);
    if (!g) continue;
    const p = pointOnWall(g, fx.offset, fs * 0.9);
    const s = FIXTURE[fx.type];
    out.push(
      `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${f(fs * 0.75)}" fill="${s.c}" stroke="#fff" stroke-width="1"/>`,
      `<text x="${f(p[0])}" y="${f(p[1])}" fill="#fff" font-size="${f(fs * 0.85)}" font-weight="bold" text-anchor="middle" dominant-baseline="central">${s.t}</text>`,
    );
  }

  for (const g of plan.walls) {
    const p = pointOnWall(g, g.wall.length / 2, -WALL_T - fs * 2.6);
    out.push(textAlong(g, p, `${g.wall.id} = ${g.wall.length} cm`, fs, COLORS.dim, true));
  }

  const legendY = maxY + PAD + 10;
  const lines = [
    `${title} — ${plan.walls.length} walls, ${plan.area.toFixed(1)} m², ceiling ${sketch.ceilingHeight} cm`,
    layout
      ? `${layout.shape}-shape · counter ${layout.counterLength} cm · S sink · DW dishwasher · H hob · HD hood · F fridge · C corner · dashed = wall cabinets`
      : "Red = doors · Blue = windows · W water · G gas · D drain · C chimney",
  ];
  lines.forEach((t, i) =>
    out.push(`<text x="${f(minX)}" y="${f(legendY + i * fs * 1.6)}" fill="#333" font-size="${f(fs * (i ? 0.8 : 1))}">${esc(t)}</text>`),
  );
  out.push("</svg>");
  return out.join("\n");
}

function textAlong(g: WallGeometry, p: Point, text: string, size: number, color: string, bold = false): string {
  const vertical = g.dir[0] === 0;
  const rot = vertical ? ` transform="rotate(-90 ${f(p[0])} ${f(p[1])})"` : "";
  return `<text x="${f(p[0])}" y="${f(p[1])}" fill="${color}" font-size="${f(size)}"${bold ? ' font-weight="bold"' : ""} text-anchor="middle" dominant-baseline="middle"${rot}>${esc(text)}</text>`;
}

function renderUnit(g: WallGeometry, u: PlacedUnit, fs: number): string {
  const r = rectOnWall(g, u.offset, u.width, 0, u.depth);
  const parts: string[] = [];
  if (u.kind === "wall") {
    parts.push(
      `<rect x="${f(r.x)}" y="${f(r.y)}" width="${f(r.w)}" height="${f(r.h)}" fill="none" stroke="${COLORS.wallCab}" stroke-width="1" stroke-dasharray="5 3"/>`,
    );
    if (u.type === "hood") {
      const a = pointOnWall(g, u.offset, 0);
      const b = pointOnWall(g, u.offset + u.width, u.depth);
      const c = pointOnWall(g, u.offset + u.width, 0);
      const d = pointOnWall(g, u.offset, u.depth);
      parts.push(
        `<path d="M${f(a[0])},${f(a[1])}L${f(b[0])},${f(b[1])}M${f(c[0])},${f(c[1])}L${f(d[0])},${f(d[1])}" stroke="${COLORS.wallCab}" stroke-width="0.8" stroke-dasharray="5 3"/>`,
      );
    }
    return parts.join("");
  }
  const tall = u.kind === "tall";
  const fill = tall ? COLORS.tall : u.type === "filler" ? "#e6d3ad" : COLORS.base;
  parts.push(
    `<rect x="${f(r.x)}" y="${f(r.y)}" width="${f(r.w)}" height="${f(r.h)}" fill="${fill}" stroke="${tall ? COLORS.tallStroke : COLORS.baseStroke}" stroke-width="1.2"/>`,
  );
  const c = pointOnWall(g, u.offset + u.width / 2, u.depth / 2);
  if (u.type === "sink") {
    const bowl = rectOnWall(g, u.offset + 8, u.width - 16, 10, u.depth - 12);
    parts.push(`<rect x="${f(bowl.x)}" y="${f(bowl.y)}" width="${f(bowl.w)}" height="${f(bowl.h)}" rx="6" fill="#fff" stroke="#7a8b99" stroke-width="1.2"/>`);
  } else if (u.type === "hob") {
    for (const [a, d] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) {
      const p = pointOnWall(g, u.offset + u.width * a, u.depth * d);
      parts.push(`<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${f(u.width * 0.13)}" fill="none" stroke="#333" stroke-width="1.2"/>`);
    }
  } else if (u.type === "corner") {
    const blind = rectOnWall(g, u.offset + u.width - DIMENSIONS.baseDepth, DIMENSIONS.baseDepth, 0, u.depth);
    parts.push(`<rect x="${f(blind.x)}" y="${f(blind.y)}" width="${f(blind.w)}" height="${f(blind.h)}" fill="none" stroke="${COLORS.baseStroke}" stroke-width="0.6" stroke-dasharray="2 2"/>`);
  }
  const label = `${LABEL[u.type]}${u.type === "filler" ? "" : u.width}`;
  if (u.width >= 20 && u.type !== "hob" && u.type !== "sink") {
    parts.push(`<text x="${f(c[0])}" y="${f(c[1])}" fill="#3b2f1a" font-size="${f(fs * 0.8)}" text-anchor="middle" dominant-baseline="central">${esc(label)}</text>`);
  } else if (u.type === "hob" || u.type === "sink") {
    const lp = pointOnWall(g, u.offset + u.width / 2, u.depth - fs * 0.5);
    parts.push(`<text x="${f(lp[0])}" y="${f(lp[1])}" fill="#3b2f1a" font-size="${f(fs * 0.7)}" text-anchor="middle" dominant-baseline="central">${esc(label)}</text>`);
  }
  return parts.join("");
}
