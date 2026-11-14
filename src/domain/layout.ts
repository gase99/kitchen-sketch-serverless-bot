import { buildPlan, pointOnWall, type PlanGeometry, type WallGeometry } from "./plan";
import type { KitchenSketch } from "./schema";

export type LayoutShape = "auto" | "linear" | "L" | "U";
export type UnitKind = "base" | "wall" | "tall";
export type UnitType =
  | "sink"
  | "dishwasher"
  | "hob"
  | "fridge"
  | "corner"
  | "cabinet"
  | "filler"
  | "hood"
  | "wall-cabinet";

export interface PlacedUnit {
  id: string;
  wallId: string;
  kind: UnitKind;
  type: UnitType;
  /** Distance from the wall start, cm. */
  offset: number;
  width: number;
  depth: number;
  height: number;
}

export type LayoutWarning =
  | "U_NOT_POSSIBLE"
  | "U_NARROW_AISLE"
  | "L_NOT_POSSIBLE"
  | "NO_SINK"
  | "NO_DISHWASHER"
  | "NO_HOB"
  | "NO_FRIDGE";

export interface KitchenLayout {
  shape: Exclude<LayoutShape, "auto">;
  wallIds: string[];
  units: PlacedUnit[];
  counterLength: number;
  warnings: LayoutWarning[];
}

export const DIMENSIONS = {
  baseDepth: 60,
  baseHeight: 85,
  wallDepth: 35,
  wallHeight: 70,
  tallDepth: 65,
  tallHeight: 210,
  doorClearance: 5,
  lowSill: 85,
  cornerWidth: 100,
  sinkWidth: 80,
  applianceWidth: 60,
  minRun: 30,
} as const;

const MODULE_WIDTHS = [80, 60, 50, 45, 40, 30];

type Interval = [number, number];

interface WallState {
  geom: WallGeometry;
  free: Interval[];
}

/**
 * Rule-based cabinet layout:
 * 1. pick the walls to furnish (linear / L / U) by free length, window and utility points,
 * 2. resolve inside corners with a blind-corner unit,
 * 3. place sink (under window or at the water point), dishwasher next to it,
 *    hob at the gas point or at a comfortable work-triangle distance, fridge at a run end near the door,
 * 4. fill the remaining gaps with standard module widths (DP, fewest modules) and fillers,
 * 5. add wall cabinets above, skipping windows, doors, tall units and the hob (hood instead).
 */
export function generateLayout(sketch: KitchenSketch, requested: LayoutShape = "auto"): KitchenLayout {
  const plan = buildPlan(sketch);
  const warnings: LayoutWarning[] = [];
  const D = DIMENSIONS;

  const states = new Map<string, WallState>(
    plan.walls.map((g) => [g.wall.id, { geom: g, free: baseIntervals(sketch, plan, g) }]),
  );

  const { shape, wallIds } = chooseWalls(sketch, plan, states, requested, warnings);
  const selected = wallIds.map((id) => states.get(id)!);
  const units: PlacedUnit[] = [];
  let seq = 0;
  const add = (s: WallState, kind: UnitKind, type: UnitType, offset: number, width: number) => {
    const depth = kind === "wall" ? D.wallDepth : kind === "tall" ? D.tallDepth : D.baseDepth;
    const height = kind === "wall" ? D.wallHeight : kind === "tall" ? D.tallHeight : D.baseHeight;
    const unit: PlacedUnit = { id: `U${++seq}`, wallId: s.geom.wall.id, kind, type, offset, width, depth, height };
    units.push(unit);
    if (kind !== "wall") s.free = subtract(s.free, [offset, offset + width]);
    return unit;
  };

  // Inside corners between consecutive selected walls: wall A keeps the corner (blind unit), wall B starts after it.
  for (let i = 0; i + 1 < selected.length; i++) {
    const a = selected[i];
    const b = selected[i + 1];
    const aLen = a.geom.wall.length;
    const aLast = a.free[a.free.length - 1];
    const bFirst = b.free[0];
    if (!aLast || !bFirst || aLast[1] < aLen || bFirst[0] > 0) continue;
    b.free = subtract(b.free, [0, D.baseDepth]);
    if (aLast[1] - aLast[0] >= D.cornerWidth) add(a, "base", "corner", aLen - D.cornerWidth, D.cornerWidth);
  }

  const sink = placeSink(sketch, selected, add, warnings);
  if (sink) placeDishwasher(selected, sink, add, warnings);
  const hob = placeHob(sketch, selected, sink, add, warnings);
  placeFridge(sketch, plan, selected, hob, add, warnings);

  for (const s of selected) {
    for (const [a, b] of s.free) fillModules(s, a, b, "base", add);
  }

  placeWallCabinets(sketch, selected, units, hob, add);

  units.sort((u, v) => wallIds.indexOf(u.wallId) - wallIds.indexOf(v.wallId) || u.offset - v.offset);
  units.forEach((u, i) => (u.id = `U${i + 1}`));
  const counterLength = units.filter((u) => u.kind === "base").reduce((sum, u) => sum + u.width, 0);
  return { shape, wallIds, units, counterLength, warnings };
}

type Rect = { x0: number; y0: number; x1: number; y1: number };

function rectBetween(p: [number, number], q: [number, number]): Rect {
  return { x0: Math.min(p[0], q[0]), y0: Math.min(p[1], q[1]), x1: Math.max(p[0], q[0]), y1: Math.max(p[1], q[1]) };
}

function baseIntervals(sketch: KitchenSketch, plan: PlanGeometry, g: WallGeometry): Interval[] {
  let free: Interval[] = [[0, g.wall.length]];
  const strip = rectBetween(pointOnWall(g, 0, 0), pointOnWall(g, g.wall.length, DIMENSIONS.tallDepth));
  for (const o of sketch.openings) {
    if (o.wallId === g.wall.id) {
      const blocksBase = o.type === "door" || (o.sillHeight ?? 90) < DIMENSIONS.lowSill;
      if (blocksBase) free = subtract(free, [o.offset - DIMENSIONS.doorClearance, o.offset + o.width + DIMENSIONS.doorClearance]);
      continue;
    }
    if (o.type !== "door") continue;
    // Keep the swing area of doors on neighbouring walls clear of cabinets.
    const h = plan.walls.find((x) => x.wall.id === o.wallId);
    if (!h) continue;
    const swing = rectBetween(pointOnWall(h, o.offset, 0), pointOnWall(h, o.offset + o.width, o.width));
    const x0 = Math.max(strip.x0, swing.x0);
    const y0 = Math.max(strip.y0, swing.y0);
    const x1 = Math.min(strip.x1, swing.x1);
    const y1 = Math.min(strip.y1, swing.y1);
    if (x1 - x0 <= 0.5 || y1 - y0 <= 0.5) continue;
    const along = (x: number, y: number) => (x - g.start[0]) * g.dir[0] + (y - g.start[1]) * g.dir[1];
    const a = along(x0, y0);
    const b = along(x1, y1);
    free = subtract(free, [Math.min(a, b) - DIMENSIONS.doorClearance, Math.max(a, b) + DIMENSIONS.doorClearance]);
  }
  return free.filter(([a, b]) => b - a >= DIMENSIONS.minRun);
}

function freeLength(s: WallState): number {
  return s.free.reduce((sum, [a, b]) => sum + (b - a), 0);
}

function chooseWalls(
  sketch: KitchenSketch,
  plan: PlanGeometry,
  states: Map<string, WallState>,
  requested: LayoutShape,
  warnings: LayoutWarning[],
): { shape: KitchenLayout["shape"]; wallIds: string[] } {
  const n = plan.walls.length;
  const score = (g: WallGeometry) => {
    const id = g.wall.id;
    let s = freeLength(states.get(id)!);
    if (sketch.fixtures.some((f) => f.wallId === id && (f.type === "water" || f.type === "drain"))) s += 150;
    if (sketch.openings.some((o) => o.wallId === id && o.type === "window")) s += 80;
    return s;
  };
  let primaryIdx = 0;
  plan.walls.forEach((g, i) => {
    if (score(g) > score(plan.walls[primaryIdx])) primaryIdx = i;
  });
  const primary = plan.walls[primaryIdx];
  const prev = plan.walls[(primaryIdx - 1 + n) % n];
  const next = plan.walls[(primaryIdx + 1) % n];
  const usable = (g: WallGeometry, min: number) => freeLength(states.get(g.wall.id)!) >= min;
  const prevOk = primary.innerCornerAtStart && usable(prev, 90);
  const nextOk = primary.innerCornerAtEnd && usable(next, 90);

  let shape: KitchenLayout["shape"];
  if (requested === "auto") {
    if (prevOk && nextOk && primary.wall.length >= 270 && usable(prev, 150) && usable(next, 150)) shape = "U";
    else if ((prevOk && usable(prev, 120)) || (nextOk && usable(next, 120))) shape = "L";
    else shape = "linear";
  } else {
    shape = requested;
    if (shape === "U" && !(prevOk && nextOk)) {
      warnings.push("U_NOT_POSSIBLE");
      shape = "L";
    }
    if (shape === "U" && primary.wall.length < 240) warnings.push("U_NARROW_AISLE");
    if (shape === "L" && !(prevOk || nextOk)) {
      warnings.push("L_NOT_POSSIBLE");
      shape = "linear";
    }
  }

  const ids: string[] = [];
  if (shape === "U") ids.push(prev.wall.id, primary.wall.id, next.wall.id);
  else if (shape === "L") {
    const useNext = nextOk && (!prevOk || freeLength(states.get(next.wall.id)!) >= freeLength(states.get(prev.wall.id)!));
    if (useNext) ids.push(primary.wall.id, next.wall.id);
    else ids.push(prev.wall.id, primary.wall.id);
  } else ids.push(primary.wall.id);
  return { shape, wallIds: ids };
}

type AddFn = (s: WallState, kind: UnitKind, type: UnitType, offset: number, width: number) => PlacedUnit;

/** Best start position for a unit of `width` inside the free intervals, closest to `target` (center). */
function fitNear(s: WallState, width: number, target: number): number | null {
  let best: number | null = null;
  for (const [a, b] of s.free) {
    if (b - a < width) continue;
    const start = Math.min(Math.max(target - width / 2, a), b - width);
    if (best === null || Math.abs(start + width / 2 - target) < Math.abs(best + width / 2 - target)) best = start;
  }
  return best === null ? null : Math.round(best);
}

function placeSink(
  sketch: KitchenSketch,
  selected: WallState[],
  add: AddFn,
  warnings: LayoutWarning[],
): PlacedUnit | null {
  const targets: Array<{ s: WallState; at: number }> = [];
  for (const s of selected) {
    const id = s.geom.wall.id;
    for (const f of sketch.fixtures) if (f.wallId === id && (f.type === "water" || f.type === "drain")) targets.push({ s, at: f.offset });
  }
  for (const s of selected) {
    for (const o of sketch.openings) if (o.wallId === s.geom.wall.id && o.type === "window") targets.push({ s, at: o.offset + o.width / 2 });
  }
  const primary = selected[Math.floor(selected.length / 2)];
  targets.push({ s: primary, at: primary.geom.wall.length / 2 });
  for (const s of selected) targets.push({ s, at: s.geom.wall.length / 2 });

  for (const width of [DIMENSIONS.sinkWidth, DIMENSIONS.applianceWidth]) {
    for (const t of targets) {
      const pos = fitNear(t.s, width, t.at);
      if (pos !== null) return add(t.s, "base", "sink", pos, width);
    }
  }
  warnings.push("NO_SINK");
  return null;
}

function placeDishwasher(selected: WallState[], sink: PlacedUnit, add: AddFn, warnings: LayoutWarning[]): void {
  const s = selected.find((x) => x.geom.wall.id === sink.wallId)!;
  const w = DIMENSIONS.applianceWidth;
  for (const start of [sink.offset + sink.width, sink.offset - w]) {
    if (s.free.some(([a, b]) => start >= a && start + w <= b)) {
      add(s, "base", "dishwasher", start, w);
      return;
    }
  }
  warnings.push("NO_DISHWASHER");
}

function frontCenter(s: WallState, offset: number, width: number) {
  return pointOnWall(s.geom, offset + width / 2, DIMENSIONS.baseDepth);
}

function distance(p: [number, number], q: [number, number]) {
  return Math.hypot(p[0] - q[0], p[1] - q[1]);
}

function placeHob(
  sketch: KitchenSketch,
  selected: WallState[],
  sink: PlacedUnit | null,
  add: AddFn,
  warnings: LayoutWarning[],
): PlacedUnit | null {
  const w = DIMENSIONS.applianceWidth;
  const sinkState = sink ? selected.find((x) => x.geom.wall.id === sink.wallId)! : null;
  const sinkPt = sink && sinkState ? frontCenter(sinkState, sink.offset, sink.width) : null;
  const gas = sketch.fixtures.find((f) => (f.type === "gas" || f.type === "chimney") && selected.some((s) => s.geom.wall.id === f.wallId));

  let best: { s: WallState; pos: number; cost: number } | null = null;
  for (const s of selected) {
    const windows = sketch.openings.filter((o) => o.wallId === s.geom.wall.id && o.type === "window");
    for (const [a, b] of s.free) {
      // Keep at least 30 cm of worktop on both sides of the hob when possible.
      for (let pos = a; pos + w <= b; pos += 5) {
        let cost = 0;
        if (pos - a < 30) cost += 60;
        if (b - (pos + w) < 30) cost += 60;
        if (windows.some((o) => pos < o.offset + o.width && pos + w > o.offset)) cost += 500;
        if (gas) {
          cost += gas.wallId === s.geom.wall.id ? Math.abs(pos + w / 2 - gas.offset) : 1000;
        } else if (sinkPt) {
          cost += Math.abs(distance(frontCenter(s, pos, w), sinkPt) - 150);
        }
        if (!best || cost < best.cost) best = { s, pos, cost };
      }
    }
  }
  if (!best) {
    warnings.push("NO_HOB");
    return null;
  }
  return add(best.s, "base", "hob", best.pos, w);
}

function placeFridge(
  sketch: KitchenSketch,
  plan: PlanGeometry,
  selected: WallState[],
  hob: PlacedUnit | null,
  add: AddFn,
  warnings: LayoutWarning[],
): void {
  const w = DIMENSIONS.applianceWidth;
  const doors = sketch.openings
    .filter((o) => o.type === "door")
    .map((o) => {
      const g = plan.walls.find((x) => x.wall.id === o.wallId)!;
      return pointOnWall(g, o.offset + o.width / 2, 0);
    });
  let best: { s: WallState; pos: number; cost: number } | null = null;
  for (const s of selected) {
    for (const [a, b] of s.free) {
      if (b - a < w) continue;
      for (const pos of [a, b - w]) {
        if (hob && hob.wallId === s.geom.wall.id && Math.abs(pos - hob.offset) < w + 30) continue;
        const p = frontCenter(s, pos, w);
        const cost = doors.length ? Math.min(...doors.map((d) => distance(p, d))) : 0;
        if (!best || cost < best.cost) best = { s, pos, cost };
      }
    }
  }
  if (!best) {
    warnings.push("NO_FRIDGE");
    return;
  }
  add(best.s, "tall", "fridge", best.pos, w);
}

/** Fills [a, b] with standard modules (fewest pieces, preferring 60 cm) plus a filler for the remainder. */
function fillModules(s: WallState, a: number, b: number, kind: "base" | "wall", add: AddFn): void {
  const len = Math.floor(b - a);
  if (len <= 0) return;
  const widths = pickModules(len);
  let pos = a;
  for (const w of widths) {
    add(s, kind, kind === "base" ? "cabinet" : "wall-cabinet", pos, w);
    pos += w;
  }
  const rest = b - pos;
  if (rest >= 1 && kind === "base") add(s, "base", "filler", pos, Math.round(rest));
}

export function pickModules(len: number): number[] {
  const cost: number[] = new Array(len + 1).fill(Infinity);
  const prev: number[] = new Array(len + 1).fill(0);
  cost[0] = 0;
  for (let r = 1; r <= len; r++) {
    for (const w of MODULE_WIDTHS) {
      if (w > r || cost[r - w] === Infinity) continue;
      const c = cost[r - w] + 1 + (w === 60 ? 0 : 0.1);
      if (c < cost[r]) {
        cost[r] = c;
        prev[r] = w;
      }
    }
  }
  let r = len;
  while (r > 0 && cost[r] === Infinity) r--;
  const out: number[] = [];
  while (r > 0) {
    out.push(prev[r]);
    r -= prev[r];
  }
  return out.sort((x, y) => y - x);
}

function placeWallCabinets(
  sketch: KitchenSketch,
  selected: WallState[],
  units: PlacedUnit[],
  hob: PlacedUnit | null,
  add: AddFn,
): void {
  const D = DIMENSIONS;
  const intervals = selected.map((s) => {
    const id = s.geom.wall.id;
    let free: Interval[] = [];
    for (const u of units) if (u.wallId === id && u.kind === "base") free = union(free, [u.offset, u.offset + u.width]);
    for (const o of sketch.openings) {
      if (o.wallId !== id) continue;
      const m = o.type === "door" ? D.doorClearance : 0;
      free = subtract(free, [o.offset - m, o.offset + o.width + m]);
    }
    for (const u of units) if (u.wallId === id && (u.kind === "tall" || u.type === "hob")) free = subtract(free, [u.offset, u.offset + u.width]);
    return free;
  });
  for (let i = 0; i + 1 < selected.length; i++) {
    const aLast = intervals[i][intervals[i].length - 1];
    if (aLast && aLast[1] >= selected[i].geom.wall.length) intervals[i + 1] = subtract(intervals[i + 1], [0, D.wallDepth]);
  }
  selected.forEach((s, i) => {
    for (const [a, b] of intervals[i]) if (b - a >= D.minRun) fillModules(s, a, b, "wall", add);
  });
  if (hob) {
    const s = selected.find((x) => x.geom.wall.id === hob.wallId)!;
    add(s, "wall", "hood", hob.offset, hob.width);
  }
}

function subtract(list: Interval[], [c, d]: Interval): Interval[] {
  const out: Interval[] = [];
  for (const [a, b] of list) {
    if (d <= a || c >= b) out.push([a, b]);
    else {
      if (c > a) out.push([a, c]);
      if (d < b) out.push([d, b]);
    }
  }
  return out.filter(([a, b]) => b - a > 0.5);
}

function union(list: Interval[], iv: Interval): Interval[] {
  const all = [...list, iv].sort((x, y) => x[0] - y[0]);
  const out: Interval[] = [];
  for (const [a, b] of all) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 0.5) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

export function billOfMaterials(layout: KitchenLayout): Array<{ kind: UnitKind; type: UnitType; width: number; count: number }> {
  const map = new Map<string, { kind: UnitKind; type: UnitType; width: number; count: number }>();
  for (const u of layout.units) {
    const key = `${u.kind}|${u.type}|${u.width}`;
    const row = map.get(key) ?? { kind: u.kind, type: u.type, width: u.width, count: 0 };
    row.count++;
    map.set(key, row);
  }
  const order: UnitKind[] = ["base", "tall", "wall"];
  return [...map.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.type.localeCompare(b.type) || b.width - a.width);
}
