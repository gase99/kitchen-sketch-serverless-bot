/**
 * Structured description of a hand-drawn kitchen sketch, as extracted by the Vision model.
 *
 * Geometry convention (orthogonal rooms only):
 * - All lengths are centimetres.
 * - Walls are listed in order, walking CLOCKWISE around the room as seen from above,
 *   starting at the top-left corner and heading east. "north" = up on the drawing.
 * - Opening `offset` is measured along its wall, from the wall's start point.
 */
export type Direction = "east" | "south" | "west" | "north";

export interface Wall {
  id: string;
  length: number;
  direction: Direction;
}

export type OpeningType = "door" | "window";

export interface Opening {
  id: string;
  type: OpeningType;
  wallId: string;
  offset: number;
  width: number;
  /** Window sill height from the floor. */
  sillHeight?: number;
}

export type FixtureType = "water" | "gas" | "drain" | "chimney";

export interface Fixture {
  type: FixtureType;
  wallId: string;
  offset: number;
}

export interface KitchenSketch {
  unit: "cm";
  ceilingHeight: number;
  walls: Wall[];
  openings: Opening[];
  fixtures: Fixture[];
  /** 0..1, model's self-reported confidence in the reading. */
  confidence: number;
  notes: string[];
}

const DIRECTIONS: Direction[] = ["east", "south", "west", "north"];

/** JSON Schema handed to the Vision model (OpenAPI-subset, accepted by Gemini and OpenAI). */
export const KITCHEN_SKETCH_JSON_SCHEMA = {
  type: "object",
  properties: {
    unit: { type: "string", enum: ["cm"] },
    ceilingHeight: { type: "number", description: "Ceiling height in cm; 270 if not written." },
    walls: {
      type: "array",
      description: "Walls in clockwise order starting at the top-left corner heading east.",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "W1, W2, ..." },
          length: { type: "number", description: "Interior length in cm." },
          direction: { type: "string", enum: DIRECTIONS },
        },
        required: ["id", "length", "direction"],
      },
    },
    openings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "D1, D2 for doors; N1, N2 for windows." },
          type: { type: "string", enum: ["door", "window"] },
          wallId: { type: "string" },
          offset: { type: "number", description: "Distance in cm from the wall start to the opening edge." },
          width: { type: "number" },
          sillHeight: { type: "number", description: "Windows only; 90 if unknown." },
        },
        required: ["id", "type", "wallId", "offset", "width"],
      },
    },
    fixtures: {
      type: "array",
      description: "Utility points drawn on the sketch (water, gas, drain, chimney/hood duct).",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["water", "gas", "drain", "chimney"] },
          wallId: { type: "string" },
          offset: { type: "number" },
        },
        required: ["type", "wallId", "offset"],
      },
    },
    confidence: { type: "number", description: "0..1" },
    notes: { type: "array", items: { type: "string" }, description: "Assumptions and unreadable parts." },
  },
  required: ["unit", "ceilingHeight", "walls", "openings", "fixtures", "confidence", "notes"],
} as const;

export class SketchValidationError extends Error {}

const AXIS: Record<Direction, [number, number]> = {
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
  north: [0, -1],
};

export function directionVector(d: Direction): [number, number] {
  return AXIS[d];
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
}

function round(n: number): number {
  return Math.round(n);
}

/**
 * Validates and repairs raw model output:
 * - coerces numbers, drops unknown ids, clamps openings to their wall,
 * - merges consecutive walls with the same direction,
 * - closes the polygon if the measured lengths do not add up (adds a note).
 */
export function normalizeSketch(raw: unknown): KitchenSketch {
  if (!raw || typeof raw !== "object") throw new SketchValidationError("Model output is not an object");
  const r = raw as Record<string, unknown>;
  const notes: string[] = Array.isArray(r.notes) ? r.notes.map(String) : [];

  const rawWalls = Array.isArray(r.walls) ? r.walls : [];
  let walls: Wall[] = rawWalls
    .map((w: any, i: number) => ({
      id: String(w?.id ?? `W${i + 1}`),
      length: round(num(w?.length, 0)),
      direction: String(w?.direction ?? "").toLowerCase() as Direction,
    }))
    .filter((w) => w.length > 0 && DIRECTIONS.includes(w.direction));

  walls = mergeCollinear(walls);
  if (walls.length < 4) throw new SketchValidationError("At least 4 orthogonal walls are required");
  for (let i = 0; i < walls.length; i++) {
    const a = AXIS[walls[i].direction];
    const b = AXIS[walls[(i + 1) % walls.length].direction];
    if (a[0] * b[0] + a[1] * b[1] !== 0) {
      throw new SketchValidationError(`Walls ${walls[i].id} and ${walls[(i + 1) % walls.length].id} are not perpendicular`);
    }
  }
  closePolygon(walls, notes);

  const wallById = new Map(walls.map((w) => [w.id, w]));

  const openings: Opening[] = (Array.isArray(r.openings) ? r.openings : [])
    .map((o: any, i: number): Opening | null => {
      const wall = wallById.get(String(o?.wallId));
      const type = o?.type === "window" ? "window" : o?.type === "door" ? "door" : null;
      if (!wall || !type) return null;
      const width = Math.min(round(num(o.width, type === "door" ? 90 : 120)), wall.length);
      const offset = Math.max(0, Math.min(round(num(o.offset, 0)), wall.length - width));
      const op: Opening = { id: String(o.id ?? `${type === "door" ? "D" : "N"}${i + 1}`), type, wallId: wall.id, offset, width };
      if (type === "window") op.sillHeight = round(num(o.sillHeight, 90));
      return op;
    })
    .filter((o): o is Opening => o !== null);

  const fixtures: Fixture[] = (Array.isArray(r.fixtures) ? r.fixtures : [])
    .map((f: any): Fixture | null => {
      const wall = wallById.get(String(f?.wallId));
      if (!wall || !["water", "gas", "drain", "chimney"].includes(f?.type)) return null;
      return { type: f.type, wallId: wall.id, offset: Math.max(0, Math.min(round(num(f.offset, 0)), wall.length)) };
    })
    .filter((f): f is Fixture => f !== null);

  return {
    unit: "cm",
    ceilingHeight: round(num(r.ceilingHeight, 270)) || 270,
    walls,
    openings,
    fixtures,
    confidence: Math.max(0, Math.min(1, num(r.confidence, 0.5))),
    notes,
  };
}

function mergeCollinear(walls: Wall[]): Wall[] {
  const out: Wall[] = [];
  for (const w of walls) {
    const prev = out[out.length - 1];
    if (prev && prev.direction === w.direction) prev.length += w.length;
    else out.push({ ...w });
  }
  if (out.length > 1 && out[0].direction === out[out.length - 1].direction) {
    const last = out.pop()!;
    out[0].length += last.length;
  }
  return out;
}

/** Distributes the closing error onto the last horizontal / vertical wall that is not locked. */
function closePolygon(walls: Wall[], notes: string[], locked: ReadonlySet<string> = new Set()): void {
  let dx = 0;
  let dy = 0;
  for (const w of walls) {
    const [vx, vy] = AXIS[w.direction];
    dx += vx * w.length;
    dy += vy * w.length;
  }
  const fix = (err: number, horizontal: boolean) => {
    if (err === 0) return;
    for (let i = walls.length - 1; i >= 0; i--) {
      const w = walls[i];
      const [vx, vy] = AXIS[w.direction];
      const v = horizontal ? vx : vy;
      if (v === 0 || locked.has(w.id)) continue;
      const newLen = w.length - v * err;
      if (newLen > 0) {
        notes.push(`Dimensions did not close: ${w.id} adjusted from ${w.length} to ${newLen} cm.`);
        w.length = newLen;
        return;
      }
    }
    throw new SketchValidationError("Wall lengths cannot form a closed room");
  };
  fix(dx, true);
  fix(dy, false);
}

/** Applies manual corrections such as "W1=380" or "H=260". Returns the ids that changed. */
export function applyDimensionEdits(sketch: KitchenSketch, text: string): string[] {
  const changed: string[] = [];
  const t = toLatinDigits(text);
  const re = /\b(W\d+|H)\s*[=:]?\s*(\d{2,4})\b/gi;
  for (const m of t.matchAll(re)) {
    const key = m[1].toUpperCase();
    const value = Number(m[2]);
    if (key === "H") {
      sketch.ceilingHeight = value;
      changed.push("H");
      continue;
    }
    const wall = sketch.walls.find((w) => w.id.toUpperCase() === key);
    if (wall) {
      wall.length = value;
      changed.push(wall.id);
    }
  }
  closePolygon(sketch.walls, sketch.notes, new Set(changed));
  return changed;
}

export function looksLikeDimensionEdit(text: string): boolean {
  return /^\s*((W\d+|H)\s*[=:]?\s*\d{2,4}[\s,،;]*)+$/i.test(toLatinDigits(text));
}

export function toLatinDigits(s: string): string {
  return s
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}
