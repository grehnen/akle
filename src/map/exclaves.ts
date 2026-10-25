type Position = readonly number[];
type PolygonCoordinates = readonly (readonly Position[])[];

export type SplitShape = {
  /** The kommun's largest part, or its whole geometry when that isn't a MultiPolygon. */
  main: unknown;
  /** Every other part of a MultiPolygon, if any: the kommun's exclaves. */
  exclaves: { type: "MultiPolygon"; coordinates: PolygonCoordinates[] } | undefined;
};

/**
 * Splits a kommun's shape into its main part, the largest part of its boundary, and its
 * exclaves, every other part. An island inside the boundary isn't a part of its own, as the
 * boundary includes the water. Parts are compared by area on the sphere, like the graph build.
 */
export function splitExclaves(geometry: unknown): SplitShape {
  if (!isMultiPolygon(geometry) || geometry.coordinates.length === 0) {
    return { main: geometry, exclaves: undefined };
  }
  const parts = geometry.coordinates;
  const areas = parts.map(polygonArea);
  const largest = areas.indexOf(Math.max(...areas));
  const exclaves = parts.filter((_, index) => index !== largest);
  return {
    main: { type: "Polygon", coordinates: parts[largest] },
    exclaves: exclaves.length === 0 ? undefined : { type: "MultiPolygon", coordinates: exclaves },
  };
}

function isMultiPolygon(
  geometry: unknown,
): geometry is { type: "MultiPolygon"; coordinates: PolygonCoordinates[] } {
  return (
    typeof geometry === "object" &&
    geometry !== null &&
    "type" in geometry &&
    geometry.type === "MultiPolygon" &&
    "coordinates" in geometry &&
    Array.isArray(geometry.coordinates)
  );
}

/** Area on a sphere, in proportion to m²: the outer ring minus its holes. */
function polygonArea([outer, ...holes]: PolygonCoordinates): number {
  if (outer === undefined) return 0;
  return holes.reduce((area, hole) => area - ringArea(hole), ringArea(outer));
}

function ringArea(ring: readonly Position[]): number {
  const radians = Math.PI / 180;
  let sum = 0;
  for (let index = 0; index + 1 < ring.length; index++) {
    const [lon1 = 0, lat1 = 0] = ring[index] ?? [];
    const [lon2 = 0, lat2 = 0] = ring[index + 1] ?? [];
    sum += (lon2 - lon1) * radians * (2 + Math.sin(lat1 * radians) + Math.sin(lat2 * radians));
  }
  return Math.abs(sum);
}
