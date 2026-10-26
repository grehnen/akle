type Position = readonly number[];
type PolygonCoordinates = readonly (readonly Position[])[];
type MultiPolygon = { type: "MultiPolygon"; coordinates: PolygonCoordinates[] };

export type SplitShape = {
  /** Every part that isn't an exclave, or the whole geometry when that isn't a MultiPolygon. */
  main: unknown;
  /** The parts of a MultiPolygon that are exclaves, if any. */
  exclaves: MultiPolygon | undefined;
};

/**
 * Splits a kommun's drawn shape into its exclaves, the parts `exclaveParts` lists by index, and
 * everything else. Only the graph build can tell an exclave from a part that is cut off by a
 * shared lake or is an island, as both lie outside the kommun's main part only in the drawn
 * shape, not its boundary (`data/exclaves/`).
 */
export function splitExclaves(
  geometry: unknown,
  exclaveParts: ReadonlySet<number> = new Set(),
): SplitShape {
  if (!isMultiPolygon(geometry)) return { main: geometry, exclaves: undefined };
  const parts = geometry.coordinates;
  const main = parts.filter((_, index) => !exclaveParts.has(index));
  const exclaves = parts.filter((_, index) => exclaveParts.has(index));
  if (exclaves.length === 0 || main.length === 0) return { main: geometry, exclaves: undefined };
  return {
    main:
      main.length === 1
        ? { type: "Polygon", coordinates: main[0] }
        : { type: "MultiPolygon", coordinates: main },
    exclaves: { type: "MultiPolygon", coordinates: exclaves },
  };
}

function isMultiPolygon(geometry: unknown): geometry is MultiPolygon {
  return (
    typeof geometry === "object" &&
    geometry !== null &&
    "type" in geometry &&
    geometry.type === "MultiPolygon" &&
    "coordinates" in geometry &&
    Array.isArray(geometry.coordinates)
  );
}
