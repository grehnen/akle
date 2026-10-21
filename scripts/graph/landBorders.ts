import Flatbush from "flatbush";
import type { KommunCode } from "../../src/graph/graphVersion";
import type { AreaGeometry, Line, Position, SharedBorder } from "./sharedBorders";

/** Where land is: land polygons (everything outside them is sea) and the lakes to leave out. */
export type LandWaterMask = {
  land: readonly AreaGeometry[];
  lakes: readonly AreaGeometry[];
};

export type LandBorder = {
  between: readonly [KommunCode, KommunCode];
  /** Length of the shared border on land, in whole metres. */
  landLength: number;
  /**
   * Where to look, rounded to 5 decimals: the middle of the longest piece on land, or of the
   * longest segment when none is on land.
   */
  at: Position;
};

const earthRadius = 6_371_008.8;

/** Measures how much of each shared border lies on land: inside the land mask, outside every lake. */
export function measureLandBorders(
  borders: readonly SharedBorder[],
  mask: LandWaterMask,
): LandBorder[] {
  const land = new PolygonIndex(mask.land);
  const lakes = new PolygonIndex(mask.lakes);
  const isOnLand = landTest(land, lakes);
  return borders.map((border) => {
    const longest: Longest = { land: undefined, any: undefined };
    const length = border.lines.reduce(
      (sum, line) => sum + lineLengthOnLand(line, [land, lakes], isOnLand, longest),
      0,
    );
    const piece = longest.land ?? longest.any;
    const middle = piece ? interpolate(piece.from, piece.to, 0.5) : [0, 0];
    return {
      between: border.between,
      landLength: Math.round(length),
      at: middle.map((value) => Math.round(value * 1e5) / 1e5),
    };
  });
}

type Piece = { from: Position; to: Position; length: number };
type Longest = { land: Piece | undefined; any: Piece | undefined };

/** Whether a point is on land: inside the land mask, outside every lake. */
export function pointOnLand(mask: LandWaterMask): (point: Position) => boolean {
  return landTest(new PolygonIndex(mask.land), new PolygonIndex(mask.lakes));
}

function landTest(land: PolygonIndex, lakes: PolygonIndex): (point: Position) => boolean {
  return (point) => land.contains(point) && !lakes.contains(point);
}

/**
 * Splits each segment where it crosses a mask edge and measures the pieces whose midpoint is on
 * land. Between two crossings a line can't change sides, so a piece's status is reused until the
 * next crossing.
 */
function lineLengthOnLand(
  line: Line,
  indexes: readonly PolygonIndex[],
  isOnLand: (point: Position) => boolean,
  longest: Longest,
): number {
  let total = 0;
  let status: boolean | undefined;
  for (let index = 0; index + 1 < line.length; index++) {
    const [from, to] = [line[index], line[index + 1]];
    const segmentLength = haversine(from, to);
    if (segmentLength > (longest.any?.length ?? -1)) {
      longest.any = { from, to, length: segmentLength };
    }
    const contacts = indexes.flatMap((polygons) => polygons.crossings(from, to));
    const cuts = [...new Set(contacts)].filter((t) => t > 0 && t < 1).sort((a, b) => a - b);
    const stops = [0, ...cuts, 1];
    // Touching a mask edge, even at a vertex, may change sides.
    if (contacts.length > 0) status = undefined;
    for (let piece = 0; piece + 1 < stops.length; piece++) {
      const [start, end] = [
        interpolate(from, to, stops[piece]),
        interpolate(from, to, stops[piece + 1]),
      ];
      if (status === undefined || piece > 0) {
        status = isOnLand(interpolate(start, end, 0.5));
      }
      if (status) {
        const pieceLength = haversine(start, end);
        total += pieceLength;
        if (pieceLength > (longest.land?.length ?? -1)) {
          longest.land = { from: start, to: end, length: pieceLength };
        }
      }
    }
    if (contacts.length > 0) status = undefined;
  }
  return total;
}

type Edge = { polygon: number; from: Position; to: Position };

/** Polygons with their edges in a spatial index, for crossings and point-in-polygon tests. */
class PolygonIndex {
  private readonly edges: Edge[] = [];
  private readonly index: Flatbush | undefined;
  private maxX = -Infinity;

  constructor(polygons: readonly AreaGeometry[]) {
    polygons.forEach((geometry, polygon) => {
      const rings =
        geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
      for (const ring of rings) {
        for (let index = 0; index + 1 < ring.length; index++) {
          this.edges.push({ polygon, from: ring[index], to: ring[index + 1] });
          this.maxX = Math.max(this.maxX, ring[index][0]);
        }
      }
    });
    if (this.edges.length === 0) return;
    this.index = new Flatbush(this.edges.length);
    for (const { from, to } of this.edges) {
      this.index.add(
        Math.min(from[0], to[0]),
        Math.min(from[1], to[1]),
        Math.max(from[0], to[0]),
        Math.max(from[1], to[1]),
      );
    }
    this.index.finish();
  }

  /** Whether a point lies inside any polygon: an odd number of a polygon's edges cross the ray east. */
  contains([x, y]: Position): boolean {
    if (!this.index) return false;
    const crossingsByPolygon = new Map<number, number>();
    for (const id of this.index.search(x, y, this.maxX, y)) {
      const { polygon, from, to } = this.edges[id];
      if (from[1] > y === to[1] > y) continue;
      const crossingX = from[0] + ((y - from[1]) / (to[1] - from[1])) * (to[0] - from[0]);
      if (crossingX > x)
        crossingsByPolygon.set(polygon, (crossingsByPolygon.get(polygon) ?? 0) + 1);
    }
    return [...crossingsByPolygon.values()].some((count) => count % 2 === 1);
  }

  /** Where along the segment (0–1) it crosses a polygon edge. */
  crossings(from: Position, to: Position): number[] {
    if (!this.index) return [];
    const found: number[] = [];
    const ids = this.index.search(
      Math.min(from[0], to[0]),
      Math.min(from[1], to[1]),
      Math.max(from[0], to[0]),
      Math.max(from[1], to[1]),
    );
    for (const id of ids) {
      const t = segmentIntersection(from, to, this.edges[id].from, this.edges[id].to);
      if (t !== undefined) found.push(t);
    }
    return found;
  }
}

/** Where along a–b (0–1) it crosses c–d, if it does. */
export function segmentIntersection(
  a: Position,
  b: Position,
  c: Position,
  d: Position,
): number | undefined {
  const [rx, ry] = [b[0] - a[0], b[1] - a[1]];
  const [sx, sy] = [d[0] - c[0], d[1] - c[1]];
  const denominator = rx * sy - ry * sx;
  if (denominator === 0) return undefined;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / denominator;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : undefined;
}

export function interpolate(from: Position, to: Position, t: number): Position {
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
}

function haversine([lon1, lat1]: Position, [lon2, lat2]: Position): number {
  const radians = Math.PI / 180;
  const dLat = (lat2 - lat1) * radians;
  const dLon = (lon2 - lon1) * radians;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}
