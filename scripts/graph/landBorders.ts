import Flatbush from "flatbush";
import type { KommunCode } from "../../src/graph/graphVersion";
import { compareCodes } from "../../src/graph/kommunPair";
import type { AreaGeometry, Line, Position, SharedBorder } from "./sharedBorders";

/**
 * Where land is: land polygons (everything outside them is sea) and the lakes to leave out. Each
 * land polygon must be a whole landmass, so its area is the island's; the largest is the mainland.
 */
export type LandWaterMask = {
  land: readonly AreaGeometry[];
  lakes: readonly AreaGeometry[];
};

/**
 * Islands smaller than this (m²), in the sea or in a lake, aren't meaningful land: a border on one
 * doesn't count, and the drawn shapes leave them out.
 */
export const minIslandArea = 1_000_000;

export type LandBorder = {
  between: readonly [KommunCode, KommunCode];
  /** Length of the shared border on land, in whole metres. */
  landLength: number;
  /** The part of it on the mainland: the largest land polygon, outside the islands in its lakes. */
  mainlandLength: number;
  /** The part of it on islands of {@link minIslandArea} or more, in the sea or in a lake. */
  islandLength: number;
  /** The kommuner, by code, whose exclaves hold the whole border on land; empty without land. */
  exclaveOf: KommunCode[];
  /**
   * Where to look, rounded to 5 decimals: the middle of the longest piece on land, or of the
   * longest segment when none is on land.
   */
  at: Position;
};

const earthRadius = 6_371_008.8;

/**
 * Measures how much of each shared border lies on land: inside the land mask, outside every lake,
 * and not on an island under {@link minIslandArea}. It splits that between the mainland and the
 * islands, and checks it against `onExclave`, which tells whether an edge of the border lies on
 * an exclave of a kommun (see `exclaveEdges`).
 */
export function measureLandBorders(
  borders: readonly SharedBorder[],
  mask: LandWaterMask,
  onExclave: (code: KommunCode, from: Position, to: Position) => boolean = () => false,
): LandBorder[] {
  const { indexes, landKind } = landIndexes(mask);
  return borders.map((border) => {
    const tally: Tally = {
      mainland: 0,
      island: 0,
      offExclave: [0, 0],
      longest: { land: undefined, any: undefined },
    };
    const exclaveSides = (from: Position, to: Position) =>
      [onExclave(border.between[0], from, to), onExclave(border.between[1], from, to)] as const;
    for (const line of border.lines) {
      measureLine(line, indexes, landKind, exclaveSides, tally);
    }
    const land = tally.mainland + tally.island;
    const piece = tally.longest.land ?? tally.longest.any;
    const middle = piece ? interpolate(piece.from, piece.to, 0.5) : [0, 0];
    return {
      between: border.between,
      landLength: Math.round(land),
      mainlandLength: Math.round(tally.mainland),
      islandLength: Math.round(tally.island),
      exclaveOf:
        land > 0
          ? border.between
              .filter((_, side) => Math.round(tally.offExclave[side]) === 0)
              .sort(compareCodes)
          : [],
      at: roundedPoint(middle),
    };
  });
}

type Piece = { from: Position; to: Position; length: number };
type LandKind = "mainland" | "island";
/** What a border's pieces on land add up to; `offExclave` per side of the pair. */
type Tally = {
  mainland: number;
  island: number;
  offExclave: [number, number];
  longest: { land: Piece | undefined; any: Piece | undefined };
};

/**
 * Whether a point is on land: inside the land mask, outside every lake, and not on an island under
 * {@link minIslandArea}.
 */
export function pointOnLand(mask: LandWaterMask): (point: Position) => boolean {
  return landIndexes(mask).isOnLand;
}

function landIndexes(mask: LandWaterMask): {
  indexes: PolygonIndex[];
  isOnLand: (point: Position) => boolean;
  landKind: (point: Position) => LandKind | undefined;
} {
  const land = new PolygonIndex(mask.land);
  const lakes = new PolygonIndex(mask.lakes);
  const islets = new PolygonIndex(smallIslands(mask));
  const isOnLand = (point: Position) =>
    land.contains(point) && !lakes.contains(point) && !islets.contains(point);
  const largest = mask.land.reduce<AreaGeometry | undefined>(
    (max, geometry) =>
      max === undefined || sphericalArea(geometry) > sphericalArea(max) ? geometry : max,
    undefined,
  );
  const mainland = new PolygonIndex(largest ? [largest] : []);
  // The mainland polygon covers its lakes, so the islands in them are holes of the lakes.
  const lakeIslands = new PolygonIndex(asPolygons(lakeHoles(mask).filter(isBigIsland)));
  return {
    // Every mainland and lake island edge is a land or lake edge, so these find all the crossings.
    indexes: [land, lakes, islets],
    isOnLand,
    landKind: (point) => {
      if (!isOnLand(point)) return undefined;
      return mainland.contains(point) && !lakeIslands.contains(point) ? "mainland" : "island";
    },
  };
}

/** Islands under {@link minIslandArea}: small land polygons, and small holes in lakes. */
function smallIslands(mask: LandWaterMask): AreaGeometry[] {
  const inSea = mask.land.flatMap(polygonsOf).map(([outer]) => outer);
  return asPolygons([...inSea, ...lakeHoles(mask)].filter((ring) => !isBigIsland(ring)));
}

function lakeHoles(mask: LandWaterMask): Position[][] {
  return mask.lakes.flatMap(polygonsOf).flatMap(([, ...holes]) => holes);
}

function isBigIsland(ring: readonly Position[]): boolean {
  return ringArea(ring) >= minIslandArea;
}

function asPolygons(rings: Position[][]): AreaGeometry[] {
  return rings.map((ring) => ({ type: "Polygon", coordinates: [ring] }));
}

function polygonsOf(geometry: AreaGeometry): Position[][][] {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

/** Area in m² on a sphere; outer rings minus holes. */
export function sphericalArea(geometry: AreaGeometry): number {
  return polygonsOf(geometry).reduce(
    (total, [outer, ...holes]) =>
      total + ringArea(outer) - holes.reduce((sum, hole) => sum + ringArea(hole), 0),
    0,
  );
}

function ringArea(ring: readonly Position[]): number {
  const radians = Math.PI / 180;
  let sum = 0;
  for (let index = 0; index + 1 < ring.length; index++) {
    const [lon1, lat1] = ring[index];
    const [lon2, lat2] = ring[index + 1];
    sum += (lon2 - lon1) * radians * (2 + Math.sin(lat1 * radians) + Math.sin(lat2 * radians));
  }
  return Math.abs((sum * earthRadius * earthRadius) / 2);
}

/** Whether a geometry's bounding box overlaps any segment's of the lines. */
export function lineProximity(lines: readonly Line[]): (geometry: AreaGeometry) => boolean {
  const segments = lines.flatMap((line) => line.slice(1).map((to, index) => [line[index], to]));
  if (segments.length === 0) return () => false;
  const index = new Flatbush(segments.length);
  for (const [from, to] of segments) {
    index.add(
      Math.min(from[0], to[0]),
      Math.min(from[1], to[1]),
      Math.max(from[0], to[0]),
      Math.max(from[1], to[1]),
    );
  }
  index.finish();
  return (geometry) => {
    const [west, south, east, north] = bounds(geometry);
    return index.search(west, south, east, north).length > 0;
  };
}

function bounds(geometry: AreaGeometry): [number, number, number, number] {
  const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  const rings = geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
  for (const ring of rings) {
    for (const [x, y] of ring) {
      box[0] = Math.min(box[0], x);
      box[1] = Math.min(box[1], y);
      box[2] = Math.max(box[2], x);
      box[3] = Math.max(box[3], y);
    }
  }
  return box;
}

/**
 * Splits each segment where it crosses a mask edge and adds up the pieces whose midpoint is on
 * land. Between two crossings a line can't change sides, so a piece's kind of land is reused until
 * the next crossing.
 */
function measureLine(
  line: Line,
  indexes: readonly PolygonIndex[],
  landKind: (point: Position) => LandKind | undefined,
  exclaveSides: (from: Position, to: Position) => readonly [boolean, boolean],
  tally: Tally,
): void {
  const { longest } = tally;
  let status: LandKind | "water" | undefined;
  for (let index = 0; index + 1 < line.length; index++) {
    const [from, to] = [line[index], line[index + 1]];
    const segmentLength = haversine(from, to);
    if (segmentLength > (longest.any?.length ?? -1)) {
      longest.any = { from, to, length: segmentLength };
    }
    const onExclave = exclaveSides(from, to);
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
        status = landKind(interpolate(start, end, 0.5)) ?? "water";
      }
      if (status !== "water") {
        const pieceLength = haversine(start, end);
        tally[status] += pieceLength;
        onExclave.forEach((isOnExclave, side) => {
          if (!isOnExclave) tally.offExclave[side] += pieceLength;
        });
        if (pieceLength > (longest.land?.length ?? -1)) {
          longest.land = { from: start, to: end, length: pieceLength };
        }
      }
    }
    if (contacts.length > 0) status = undefined;
  }
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

/** A point rounded to 5 decimals, about a metre: enough to find the spot on a map. */
export function roundedPoint(point: Position): [number, number] {
  return [Math.round(point[0] * 1e5) / 1e5, Math.round(point[1] * 1e5) / 1e5];
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
