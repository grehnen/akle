import type { KommunCode } from "./graphVersion";

/**
 * For each kommun with exclaves, the indexes of the parts of its drawn MultiPolygon that are
 * exclaves. Committed as `data/exclaves/<id>.json`, beside rather than inside the graph version's
 * directory, as it only changes how the map draws the shapes (data/README.md).
 */
export type ExclaveParts = Readonly<Record<KommunCode, readonly number[]>>;

/** The file a graph version's exclave parts are committed in, relative to `data/`. */
export function exclavePartsFile(id: string): string {
  return `exclaves/${id}.json`;
}

export function parseExclaveParts(json: unknown): ReadonlyMap<KommunCode, ReadonlySet<number>> {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new Error("exclave parts need to be an object of kommun codes");
  }
  return new Map(
    Object.entries(json).map(([code, indexes]) => {
      if (!Array.isArray(indexes) || !indexes.every(Number.isInteger)) {
        throw new Error(`exclave parts of ${code} need to be part indexes`);
      }
      return [code, new Set(indexes as number[])];
    }),
  );
}
