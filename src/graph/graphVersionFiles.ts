import {
  buildGraphVersion,
  type GraphVersion,
  type Kommun,
  type KommunShapes,
  type LinkKind,
  type NeighborLink,
} from "./graphVersion";
import { readCsv } from "../data/csv";

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

/** The file each part of a graph version is committed in. */
export const graphVersionFileNames = {
  version: "version.json",
  kommuner: "kommuner.csv",
  neighbors: "neighbors.csv",
  shapes: "shapes.geojson",
} as const satisfies Record<keyof GraphVersionFiles, string>;

/** A graph version's directory, relative to `data/`. */
export function graphVersionDirectory(id: string): string {
  return `graphs/${id}/`;
}

/** Reads a graph version's files from `directory` with `readText`, parsing the JSON ones. */
export async function readGraphVersionFiles(
  directory: string,
  readText: (path: string) => Promise<string>,
): Promise<GraphVersionFiles> {
  const [version, kommuner, neighbors, shapes] = await Promise.all(
    [
      graphVersionFileNames.version,
      graphVersionFileNames.kommuner,
      graphVersionFileNames.neighbors,
      graphVersionFileNames.shapes,
    ].map((name) => readText(`${directory}${name}`)),
  );
  return { version: JSON.parse(version), kommuner, neighbors, shapes: JSON.parse(shapes) };
}

export type GraphVersionHeader = {
  id: string;
  /** The first trip number this version applies to (ADR 0004). */
  startsAtTrip: number;
};

const linkKinds: readonly LinkKind[] = ["land", "fixed", "ferry"];

export function parseGraphVersionFiles(files: GraphVersionFiles): GraphVersion {
  return buildGraphVersion({
    ...parseGraphVersionHeader(files.version),
    kommuner: parseKommunerFile(files.kommuner),
    links: parseNeighborsFile(files.neighbors),
    shapes: files.shapes as KommunShapes,
  });
}

/** The rows of a `kommuner.csv`. */
export function parseKommunerFile(text: string): Kommun[] {
  return readCsv(text, "code,name", graphVersionFileNames.kommuner, ([code, name]) => ({
    code,
    name,
  }));
}

/** The rows of a `neighbors.csv`. */
export function parseNeighborsFile(text: string): NeighborLink[] {
  return readCsv(text, "a,b,link", graphVersionFileNames.neighbors, ([a, b, kind]) => {
    if (!linkKinds.includes(kind as LinkKind)) throw new Error(`unknown link kind "${kind}"`);
    return { between: [a, b], kind: kind as LinkKind };
  });
}

export function parseGraphVersionHeader(json: unknown): GraphVersionHeader {
  const header = json as Partial<GraphVersionHeader>;
  if (typeof header?.id !== "string" || header.id === "") {
    throw new Error("version.json needs an id");
  }
  if (!Number.isInteger(header.startsAtTrip) || (header.startsAtTrip as number) < 1) {
    throw new Error(`version.json for ${header.id} needs a startsAtTrip of 1 or more`);
  }
  return { id: header.id, startsAtTrip: header.startsAtTrip as number };
}

/** The graph version a trip number is played on: the newest one that has started. */
export function graphVersionFor<Header extends GraphVersionHeader>(
  versions: readonly Header[],
  tripNumber: number,
): Header | undefined {
  return versions
    .filter((version) => version.startsAtTrip <= tripNumber)
    .reduce<Header | undefined>(
      (newest, version) =>
        newest === undefined || version.startsAtTrip > newest.startsAtTrip ? version : newest,
      undefined,
    );
}
