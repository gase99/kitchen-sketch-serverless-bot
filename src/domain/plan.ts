import { directionVector, type KitchenSketch, type Wall } from "./schema";

export type Point = [number, number];

export interface WallGeometry {
  wall: Wall;
  start: Point;
  end: Point;
  /** Unit vector along the wall (walking clockwise). */
  dir: Point;
  /** Unit vector pointing into the room. */
  inward: Point;
  /** True when the corner at the wall start/end is a regular inside corner (cabinets meet there). */
  innerCornerAtStart: boolean;
  innerCornerAtEnd: boolean;
}

export interface PlanGeometry {
  walls: WallGeometry[];
  polygon: Point[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  area: number;
}

/**
 * Builds the 2D wall plan from the clockwise wall list.
 * SVG coordinates: x to the right, y downwards, origin at the first wall's start.
 */
export function buildPlan(sketch: KitchenSketch): PlanGeometry {
  const n = sketch.walls.length;
  const polygon: Point[] = [];
  let x = 0;
  let y = 0;
  const geoms: WallGeometry[] = sketch.walls.map((wall) => {
    const [dx, dy] = directionVector(wall.direction);
    const start: Point = [x, y];
    x += dx * wall.length;
    y += dy * wall.length;
    polygon.push(start);
    // Clockwise on a y-down screen => the room interior is on the right-hand side.
    return {
      wall,
      start,
      end: [x, y],
      dir: [dx, dy],
      inward: [-dy, dx],
      innerCornerAtStart: false,
      innerCornerAtEnd: false,
    };
  });

  for (let i = 0; i < n; i++) {
    const a = geoms[i];
    const b = geoms[(i + 1) % n];
    // Right turn (cross product > 0 in y-down coords) = inside corner of a clockwise room.
    const cross = a.dir[0] * b.dir[1] - a.dir[1] * b.dir[0];
    const inner = cross > 0;
    a.innerCornerAtEnd = inner;
    b.innerCornerAtStart = inner;
  }

  const xs = polygon.map((p) => p[0]);
  const ys = polygon.map((p) => p[1]);
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % n];
    area2 += x1 * y2 - x2 * y1;
  }

  return {
    walls: geoms,
    polygon,
    bounds: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) },
    area: Math.abs(area2) / 2 / 10_000,
  };
}

/** Point located `along` cm from the wall start and `depth` cm into the room. */
export function pointOnWall(g: WallGeometry, along: number, depth = 0): Point {
  return [g.start[0] + g.dir[0] * along + g.inward[0] * depth, g.start[1] + g.dir[1] * along + g.inward[1] * depth];
}
