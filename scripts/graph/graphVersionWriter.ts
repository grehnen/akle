import type { Kommun, KommunShapes, NeighborLink } from "../../src/graph/graphVersion";
import type { GraphVersionHeader } from "../../src/graph/graphVersionFiles";

export type GraphVersionOutput = {
  /** `version.json`: the header plus anything else worth recording, such as the sources. */
  version: GraphVersionHeader & Record<string, unknown>;
  kommuner: readonly Kommun[];
  links: readonly NeighborLink[];
  shapes: KommunShapes;
};

/** The files of a graph version (see `data/README.md`), sorted by SCB code so rebuilds diff cleanly. */
export function graphVersionFileContents(output: GraphVersionOutput): Record<string, string> {
  const kommuner = [...output.kommuner].sort((a, b) => compare(a.code, b.code));
  const pairs = output.links
    .map((link) => ({ between: [...link.between].sort(compare), kind: link.kind }))
    .sort(
      (a, b) =>
        compare(a.between[0], b.between[0]) ||
        compare(a.between[1], b.between[1]) ||
        compare(a.kind, b.kind),
    );
  const features = [...output.shapes.features].sort((a, b) =>
    compare(a.properties.code, b.properties.code),
  );
  return {
    "version.json": `${JSON.stringify(output.version, null, 2)}\n`,
    "kommuner.csv": csv(
      "code,name",
      kommuner.map((kommun) => [kommun.code, kommun.name]),
    ),
    "neighbors.csv": csv(
      "a,b,link",
      pairs.map((pair) => [...pair.between, pair.kind]),
    ),
    // One feature per line keeps the file diffable without bloating it.
    "shapes.geojson": `{"type":"FeatureCollection","features":[\n${features
      .map((feature) => JSON.stringify(feature))
      .join(",\n")}\n]}\n`,
  };
}

function csv(header: string, rows: readonly string[][]): string {
  for (const field of rows.flat()) {
    if (/[,\n"]/.test(field)) throw new Error(`CSV field can't hold "${field}"`);
  }
  return `${[header, ...rows.map((row) => row.join(","))].join("\n")}\n`;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
