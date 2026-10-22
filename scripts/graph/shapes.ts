import mapshaper from "mapshaper";
import type { KommunShapes } from "../../src/graph/graphVersion";
import { compareCodes } from "../../src/graph/kommunPair";
import { minIslandArea, sphericalArea } from "./landBorders";
import type { Feature } from "./osmTools";
import type { KommunArea } from "./sharedBorders";

/** Lakes and river areas at least this large (m²) are cut out of the drawn shapes (ADR 0002). */
const bigWaterArea = 10_000_000;
/**
 * `water=*` values that are narrow or artificial channels. River areas count as water, so a border
 * through a river doesn't count and an islet in one isn't meaningful land.
 */
const notInlandWater = new Set([
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

/** Lakes and river areas: the inland water of the land/water mask. */
export function isInlandWater(feature: Feature): boolean {
  const { properties } = feature;
  if (properties.natural !== "water") return false;
  return !notInlandWater.has(String(properties.water ?? ""));
}

export function isRiver(feature: Feature): boolean {
  return feature.properties.natural === "water" && feature.properties.water === "river";
}

export function isBigWater(water: Feature): boolean {
  return sphericalArea(water.geometry) >= bigWaterArea;
}

/** The boundaries clipped to land, with big lakes and river areas cut out, simplified for the web. */
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
      `-filter-islands min-area=${minIslandArea / 1_000_000}km2 remove-empty`,
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
