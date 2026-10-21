import type { KommunCode } from "../../src/graph/graphVersion";
import { compareCodes, pairKey } from "../../src/graph/kommunPair";

export type Position = number[];
export type Line = Position[];

export type AreaGeometry =
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };

/** One kommun's boundary, all its pieces together. */
export type KommunArea = { code: KommunCode; geometry: AreaGeometry };

/** The border two kommuner share, as lines, whether it runs over land or water. */
export type SharedBorder = {
  between: readonly [KommunCode, KommunCode];
  lines: Line[];
};

/**
 * The borders kommuner share. Neighboring OSM boundaries are built from the same ways, so a
 * shared border is made of the edges both kommuner's rings contain. A single shared point is
 * not a border. Lines follow the ring direction of the lower kommun code.
 */
export function sharedBorders(areas: readonly KommunArea[]): SharedBorder[] {
  const sorted = [...areas].sort((a, b) => compareCodes(a.code, b.code));
  const edgeOwners = new Map<string, KommunCode[]>();
  for (const area of sorted) {
    for (const ring of ringsOf(area.geometry)) {
      for (let index = 0; index + 1 < ring.length; index++) {
        const key = edgeKey(ring[index], ring[index + 1]);
        const owners = edgeOwners.get(key) ?? [];
        if (!owners.includes(area.code)) owners.push(area.code);
        edgeOwners.set(key, owners);
      }
    }
  }

  const borders = new Map<string, SharedBorder>();
  for (const area of sorted) {
    for (const ring of ringsOf(area.geometry)) {
      const ringLines = new Map<KommunCode, Line[]>();
      for (let index = 0; index + 1 < ring.length; index++) {
        const [from, to] = [ring[index], ring[index + 1]];
        const partners = (edgeOwners.get(edgeKey(from, to)) ?? []).filter(
          (code) => compareCodes(code, area.code) > 0,
        );
        for (const partner of partners) {
          const lines = ringLines.get(partner) ?? [];
          const last = lines.at(-1);
          if (last && samePosition(last[last.length - 1], from)) last.push(to);
          else lines.push([from, to]);
          ringLines.set(partner, lines);
        }
      }
      for (const [partner, lines] of ringLines) {
        joinAcrossRingStart(lines);
        const key = `${area.code}-${partner}`;
        const border = borders.get(key) ?? { between: [area.code, partner] as const, lines: [] };
        border.lines.push(...lines);
        borders.set(key, border);
      }
    }
  }
  return [...borders.values()].sort(
    (a, b) => compareCodes(a.between[0], b.between[0]) || compareCodes(a.between[1], b.between[1]),
  );
}

/**
 * The pairs of kommuner whose boundaries share at least one vertex, whether along a border or at
 * a single point, with the shared points sorted by longitude, then latitude.
 */
export function sharedVertices(
  areas: readonly KommunArea[],
): { between: [KommunCode, KommunCode]; points: Position[] }[] {
  const owners = new Map<string, { point: Position; codes: Set<KommunCode> }>();
  for (const area of areas) {
    for (const ring of ringsOf(area.geometry)) {
      for (const point of ring) {
        const key = `${point[0]},${point[1]}`;
        const entry = owners.get(key) ?? { point, codes: new Set() };
        entry.codes.add(area.code);
        owners.set(key, entry);
      }
    }
  }
  const pairs = new Map<string, { between: [KommunCode, KommunCode]; points: Position[] }>();
  for (const { point, codes } of owners.values()) {
    if (codes.size < 2) continue;
    const sorted = [...codes].sort(compareCodes);
    for (let first = 0; first < sorted.length; first++) {
      for (let second = first + 1; second < sorted.length; second++) {
        const between: [KommunCode, KommunCode] = [sorted[first], sorted[second]];
        const key = pairKey(between);
        const pair = pairs.get(key) ?? { between, points: [] };
        pair.points.push(point);
        pairs.set(key, pair);
      }
    }
  }
  return [...pairs.values()]
    .map((pair) => ({
      between: pair.between,
      points: pair.points.sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    }))
    .sort(
      (a, b) =>
        compareCodes(a.between[0], b.between[0]) || compareCodes(a.between[1], b.between[1]),
    );
}

/** A run that wraps past the ring's start point is one line, not two. */
function joinAcrossRingStart(lines: Line[]): void {
  if (lines.length < 2) return;
  const first = lines[0];
  const last = lines[lines.length - 1];
  if (samePosition(last[last.length - 1], first[0])) {
    lines[0] = [...last, ...first.slice(1)];
    lines.pop();
  }
}

function ringsOf(geometry: AreaGeometry): Position[][] {
  return geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
}

function edgeKey(a: Position, b: Position): string {
  const [first, second] = [`${a[0]},${a[1]}`, `${b[0]},${b[1]}`].sort();
  return `${first};${second}`;
}

function samePosition(a: Position, b: Position): boolean {
  return a[0] === b[0] && a[1] === b[1];
}
