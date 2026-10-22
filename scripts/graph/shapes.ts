import mapshaper from "mapshaper";
import type { KommunShapes } from "../../src/graph/graphVersion";
import { compareCodes } from "../../src/graph/kommunPair";
import type { Feature } from "./osmTools";
import type { AreaGeometry, KommunArea } from "./sharedBorders";

/** Lakes at least this large (m²) are cut out of the drawn shapes (ADR 0002). */
const bigLakeArea = 10_000_000;
/** `water=*` values that are flowing or artificial channels, not lakes (#6 counts only lakes). */
const notLakes = new Set([
  "river",
  "canal",
  "stream",
  "ditch",
  "drain",
  "rapids",
  "lock",
  "fish_pass",
  "moat",
  "wastewater",
  "stream_pool",
]);

export function isLake(feature: Feature): boolean {
  const { properties } = feature;
  if (properties.natural !== "water") return false;
  return !notLakes.has(String(properties.water ?? ""));
}

export function isBigLake(lake: Feature): boolean {
  return sphericalArea(lake.geometry) >= bigLakeArea;
}

/** The boundaries clipped to land, with big lakes cut out, simplified for the web. */
export async function drawShapes(
  kommunAreas: readonly KommunArea[],
  landAreas: readonly Feature[],
  bigLakes: readonly Feature[],
): Promise<KommunShapes> {
  const collection = (features: object[]) => ({ type: "FeatureCollection", features });
  const output = await mapshaper.applyCommands(
    [
      "-i kommuner.json",
      "-clip land.json",
      "-erase lakes.json",
      "-simplify visvalingam weighted interval=250 keep-shapes",
      "-filter-islands min-area=1km2 remove-empty",
      "-filter-fields code",
      "-o shapes.json format=geojson precision=0.001",
    ].join(" "),
    {
      "kommuner.json": collection(
        [...kommunAreas]
          .sort((a, b) => compareCodes(a.code, b.code))
          .map((area) => ({
            type: "Feature",
            properties: { code: area.code },
            geometry: area.geometry,
          })),
      ),
      "land.json": collection(
        landAreas.map(({ geometry }) => ({ type: "Feature", properties: {}, geometry })),
      ),
      "lakes.json": collection(
        bigLakes.map(({ geometry }) => ({ type: "Feature", properties: {}, geometry })),
      ),
    },
  );
  const drawnShapes = JSON.parse(String(output["shapes.json"])) as KommunShapes;
  const drawn = new Set(drawnShapes.features.map((feature) => feature.properties.code));
  const undrawn = kommunAreas.filter((area) => !drawn.has(area.code)).map((area) => area.code);
  if (undrawn.length > 0) throw new Error(`No shape left for ${undrawn.join(" ")}`);
  return drawnShapes;
}

/** Area in m² on a sphere; outer rings minus holes. */
function sphericalArea(geometry: AreaGeometry): number {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const radius = 6_371_008.8;
  const radians = Math.PI / 180;
  const ringArea = (ring: number[][]) => {
    let sum = 0;
    for (let index = 0; index + 1 < ring.length; index++) {
      const [lon1, lat1] = ring[index];
      const [lon2, lat2] = ring[index + 1];
      sum += (lon2 - lon1) * radians * (2 + Math.sin(lat1 * radians) + Math.sin(lat2 * radians));
    }
    return Math.abs((sum * radius * radius) / 2);
  };
  return polygons.reduce(
    (total, [outer, ...holes]) =>
      total + ringArea(outer) - holes.reduce((sum, hole) => sum + ringArea(hole), 0),
    0,
  );
}
