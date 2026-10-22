import { readCsv } from "../../src/data/csv";
import type { KommunShapes } from "../../src/graph/graphVersion";
import { graphVersionFileNames } from "../../src/graph/graphVersionFiles";
import type { Pair } from "../../src/graph/kommunPair";
import { linkFailures, type LinkFailure, type WayFailure } from "./fixedLinks";
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
  const shapes = JSON.parse(files[graphVersionFileNames.shapes] ?? "{}") as Partial<KommunShapes>;
  return {
    kommuner: rows(graphVersionFileNames.kommuner, "code,name").map(([code, name]) => ({
      code,
      name,
    })),
    shapeCodes: (shapes.features ?? []).map((feature) => feature.properties.code),
    landBorders: rows("land-borders.csv", "a,b,land,mainland,island,river,exclave,at").map(
      ([a, b, land, mainland, island, river, exclave, at]) => ({
        between: pair(a, b),
        landLength: Number(land),
        mainlandLength: Number(mainland),
        islandLength: Number(island),
        riverLength: Number(river),
        exclaveOf: exclave === "-" ? [] : exclave.split(" "),
        at: point(at),
      }),
    ),
    pointTouches: rows("point-touches.csv", "a,b,at").map(([a, b, at]) => ({
      between: pair(a, b),
      at: point(at),
    })),
    fixedLinks: rows("fixed-links.csv", "a,b,ways,failures").map(([a, b, ways, failures]) => ({
      between: pair(a, b),
      ways: ways.split(" ").map(Number),
      failures: failures === "-" ? [] : failures.split(" ").map(wayFailure),
    })),
  };
}

/** A `fixed-links.csv` failure, `<way id>:<reason>+<reason>`. */
function wayFailure(text: string): WayFailure {
  const [way, reasons] = text.split(":");
  return {
    way: Number(way),
    reasons: reasons.split("+").map((reason) => {
      if (!linkFailures.includes(reason as LinkFailure)) {
        throw new Error(`fixed-links.csv: unknown failure ${reason}`);
      }
      return reason as LinkFailure;
    }),
  };
}
