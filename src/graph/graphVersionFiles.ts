import {
  buildGraphVersion,
  type GraphVersion,
  type Kommun,
  type KommunShapes,
  type LinkKind,
  type NeighborLink,
} from "./graphVersion";

/**
 * The files of one graph version, as committed under `data/graphs/<id>/`:
 * `version.json`, `kommuner.csv` (code,name), `neighbors.csv` (a,b,link) and `shapes.geojson`.
 */
export type GraphVersionFiles = {
  version: unknown;
  kommuner: string;
  neighbors: string;
  shapes: unknown;
};

export type GraphVersionHeader = {
  id: string;
  /** The first puzzle number this version applies to (ADR 0004). */
  startsAtPuzzle: number;
};

const linkKinds: readonly LinkKind[] = ["land", "fixed", "ferry"];

export function parseGraphVersionFiles(files: GraphVersionFiles): GraphVersion {
  const header = parseGraphVersionHeader(files.version);
  const kommuner: Kommun[] = readCsv(files.kommuner, "code,name", "kommuner.csv").map(
    ([code, name]) => ({ code, name }),
  );
  const links: NeighborLink[] = readCsv(files.neighbors, "a,b,link", "neighbors.csv").map(
    ([a, b, kind], index) => {
      if (!linkKinds.includes(kind as LinkKind)) {
        throw new Error(`neighbors.csv line ${index + 2}: unknown link kind "${kind}"`);
      }
      return { between: [a, b], kind: kind as LinkKind };
    },
  );
  return buildGraphVersion({
    ...header,
    kommuner,
    links,
    shapes: files.shapes as KommunShapes,
  });
}

export function parseGraphVersionHeader(json: unknown): GraphVersionHeader {
  const header = json as Partial<GraphVersionHeader>;
  if (typeof header?.id !== "string" || header.id === "") {
    throw new Error("version.json needs an id");
  }
  if (!Number.isInteger(header.startsAtPuzzle) || (header.startsAtPuzzle as number) < 1) {
    throw new Error(`version.json for ${header.id} needs a startsAtPuzzle of 1 or more`);
  }
  return { id: header.id, startsAtPuzzle: header.startsAtPuzzle as number };
}

/** The graph version a puzzle number is played on: the newest one that has started. */
export function graphVersionFor<Header extends GraphVersionHeader>(
  versions: readonly Header[],
  puzzleNumber: number,
): Header | undefined {
  return versions
    .filter((version) => version.startsAtPuzzle <= puzzleNumber)
    .reduce<Header | undefined>(
      (newest, version) =>
        newest === undefined || version.startsAtPuzzle > newest.startsAtPuzzle ? version : newest,
      undefined,
    );
}

function readCsv(csv: string, header: string, fileName: string): string[][] {
  const lines = csv.split(/\r?\n/);
  if (lines[0] !== header) {
    throw new Error(`${fileName} header must be "${header}", got "${lines[0]}"`);
  }
  const columns = header.split(",").length;
  return lines.slice(1).flatMap((line, index) => {
    if (line === "") return [];
    const fields = line.split(",");
    if (fields.length !== columns || fields.some((field) => field === "")) {
      throw new Error(`${fileName} line ${index + 2}: expected ${columns} fields, got "${line}"`);
    }
    return [fields];
  });
}
