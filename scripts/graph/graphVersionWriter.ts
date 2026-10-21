import type { Kommun, KommunShapes, NeighborLink } from "../../src/graph/graphVersion";
import { compareCodes, comparePairs } from "../../src/graph/kommunPair";
import { type GraphVersionHeader, graphVersionFileNames } from "../../src/graph/graphVersionFiles";
import type { FixedLink } from "./fixedLinks";
import type { BuildEvidence } from "./neighborReview";

export type GraphVersionOutput = {
  /** `version.json`: the header plus anything else worth recording, such as the sources. */
  version: GraphVersionHeader & Record<string, unknown>;
  kommuner: readonly Kommun[];
  /** The shipped links, with the overrides applied. */
  links: readonly NeighborLink[];
  /** The detected fixed links, with their OSM way ids for `fixed-links.csv`. */
  fixedLinks?: readonly FixedLink[];
  shapes: KommunShapes;
  /** What the build found, for the review of flagged pairs (ADR 0003). */
  evidence?: Pick<BuildEvidence, "landBorders" | "pointTouches" | "scbPairs">;
};

/** The files of a graph version (see `data/README.md`), sorted by SCB code so rebuilds diff cleanly. */
export function graphVersionFileContents(output: GraphVersionOutput): Record<string, string> {
  const kommuner = [...output.kommuner].sort((a, b) => compareCodes(a.code, b.code));
  const fixedLinks = (output.fixedLinks ?? [])
    .map((link) => ({ between: [...link.between].sort(compareCodes), ways: link.ways }))
    .sort(comparePairs);
  const features = [...output.shapes.features].sort((a, b) =>
    compareCodes(a.properties.code, b.properties.code),
  );
  return {
    [graphVersionFileNames.version]: `${JSON.stringify(output.version, null, 2)}\n`,
    [graphVersionFileNames.kommuner]: csv(
      "code,name",
      kommuner.map((kommun) => [kommun.code, kommun.name]),
    ),
    [graphVersionFileNames.neighbors]: neighborsFileContent(output.links),
    "fixed-links.csv": csv(
      "a,b,ways",
      fixedLinks.map((link) => [...link.between, link.ways.join(" ")]),
    ),
    ...(output.evidence && evidenceFiles(output.evidence)),
    // One feature per line keeps the file diffable without bloating it.
    [graphVersionFileNames.shapes]: `{"type":"FeatureCollection","features":[\n${features
      .map((feature) => JSON.stringify(feature))
      .join(",\n")}\n]}\n`,
  };
}

/** `neighbors.csv`, sorted by pair and link kind. */
export function neighborsFileContent(links: readonly NeighborLink[]): string {
  const pairs = links
    .map((link) => ({ between: [...link.between].sort(compareCodes), kind: link.kind }))
    .sort((a, b) => comparePairs(a, b) || compareCodes(a.kind, b.kind));
  return csv(
    "a,b,link",
    pairs.map((pair) => [...pair.between, pair.kind]),
  );
}

function evidenceFiles(evidence: NonNullable<GraphVersionOutput["evidence"]>) {
  const sorted = <Item extends { between: readonly string[] }>(items: readonly Item[]) =>
    items
      .map((item) => ({ ...item, between: [...item.between].sort(compareCodes) }))
      .sort(comparePairs);
  const at = (point: readonly number[]) => point.join(" ");
  return {
    "land-borders.csv": csv(
      "a,b,land,at",
      sorted(evidence.landBorders).map((border) => [
        ...border.between,
        String(border.landLength),
        at(border.at),
      ]),
    ),
    "point-touches.csv": csv(
      "a,b,at",
      sorted(evidence.pointTouches).map((touch) => [...touch.between, at(touch.at)]),
    ),
    "scb-pairs.csv": csv(
      "a,b,at",
      sorted(evidence.scbPairs).map((pair) => [...pair.between, at(pair.at)]),
    ),
  };
}

function csv(header: string, rows: readonly string[][]): string {
  for (const field of rows.flat()) {
    if (/[,\n"]/.test(field)) throw new Error(`CSV field can't hold "${field}"`);
  }
  return `${[header, ...rows.map((row) => row.join(","))].join("\n")}\n`;
}
