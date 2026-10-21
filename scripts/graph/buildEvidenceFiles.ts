import { readCsv } from "../../src/data/csv";
import type { KommunShapes } from "../../src/graph/graphVersion";
import type { Pair } from "../../src/graph/kommunPair";
import type { BuildEvidence, Point } from "./neighborReview";

/**
 * The build's evidence from a graph version's committed files (see `data/README.md`), so the
 * review of flagged pairs runs without OSM.
 */
export function readBuildEvidence(files: Record<string, string>): BuildEvidence {
  const rows = (name: string, header: string): string[][] => {
    const text = files[name];
    if (text === undefined) throw new Error(`${name} is missing; rebuild with bun run graph:build`);
    return readCsv(text, header, name);
  };
  const pair = (a: string, b: string): Pair => [a, b];
  const point = (text: string): Point => {
    const [lon, lat] = text.split(" ").map(Number);
    return [lon, lat];
  };
  const shapes = JSON.parse(files["shapes.geojson"] ?? "{}") as Partial<KommunShapes>;
  return {
    kommuner: rows("kommuner.csv", "code,name").map(([code, name]) => ({ code, name })),
    shapeCodes: (shapes.features ?? []).map((feature) => feature.properties.code),
    landBorders: rows("land-borders.csv", "a,b,land,at").map(([a, b, land, at]) => ({
      between: pair(a, b),
      landLength: Number(land),
      at: point(at),
    })),
    pointTouches: rows("point-touches.csv", "a,b,at").map(([a, b, at]) => ({
      between: pair(a, b),
      at: point(at),
    })),
    fixedLinks: rows("fixed-links.csv", "a,b,ways").map(([a, b, ways]) => ({
      between: pair(a, b),
      ways: ways.split(" ").map(Number),
    })),
    scbPairs: rows("scb-pairs.csv", "a,b,at").map(([a, b, at]) => ({
      between: pair(a, b),
      at: point(at),
    })),
  };
}
