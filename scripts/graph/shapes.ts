import mapshaper from "mapshaper";
import type { KommunShapes } from "../../src/graph/graphVersion";
import { compareCodes } from "../../src/graph/kommunPair";
import { minIslandArea, sphericalArea } from "./landBorders";
import type { Feature } from "./osmTools";
import type { AreaGeometry, KommunArea } from "./sharedBorders";

/** Lakes at least this large (m²) are cut out of the drawn shapes when kommuner share them (ADR 0002). */
const bigLakeArea = 10_000_000;
/** A kommun holding less than this share of a lake's area doesn't count as sharing it. */
const minSharedLakePart = 0.01;
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

/** A lake big enough to cut out of the drawn shapes; river areas never are. */
export function isBigLake(water: Feature): boolean {
  return !isRiver(water) && sphericalArea(water.geometry) >= bigLakeArea;
}

const collection = (features: object[]) => ({ type: "FeatureCollection", features });

const kommunCollection = (kommunAreas: readonly KommunArea[]) =>
  collection(
    [...kommunAreas]
      .sort((a, b) => compareCodes(a.code, b.code))
      .map((area) => ({
        type: "Feature",
        properties: { code: area.code },
        geometry: area.geometry,
      })),
  );

type WaterPiece = {
  properties: { code: string; waters: number[] };
  geometry: AreaGeometry;
};

/**
 * The water bodies that two or more kommuner each hold at least `minSharedLakePart` of. Parts
 * outside every kommun, such as across the national border, don't count.
 */
export async function sharedWaters(
  kommunAreas: readonly KommunArea[],
  waters: readonly Feature[],
): Promise<Feature[]> {
  // The mosaic splits overlapping waters, such as a lake mapped both whole and in parts, so every
  // piece lists all the waters it belongs to.
  const output = await mapshaper.applyCommands(
    [
      "-i waters.json",
      "-mosaic calc='waters = collect(water)'",
      "-i kommuner.json",
      "-union target=waters,kommuner fields=waters,code",
      "-filter 'waters != null && code != null'",
      "-o pieces.json format=geojson",
    ].join(" "),
    {
      "waters.json": collection(
        waters.map(({ geometry }, index) => ({
          type: "Feature",
          properties: { water: index },
          geometry,
        })),
      ),
      "kommuner.json": kommunCollection(kommunAreas),
    },
  );
  const pieces = JSON.parse(String(output["pieces.json"])).features as WaterPiece[];
  const areaByKommunByWater = waters.map(() => new Map<string, number>());
  for (const piece of pieces) {
    const { code, waters: pieceWaters } = piece.properties;
    const area = sphericalArea(piece.geometry);
    for (const water of pieceWaters) {
      const areaByKommun = areaByKommunByWater[water];
      areaByKommun.set(code, (areaByKommun.get(code) ?? 0) + area);
    }
  }
  return waters.filter((water, index) => {
    const minPart = sphericalArea(water.geometry) * minSharedLakePart;
    const holders = [...areaByKommunByWater[index].values()].filter((area) => area >= minPart);
    return holders.length > 1;
  });
}

/**
 * The boundaries clipped to land, with big lakes that kommuner share cut out, simplified for the
 * web. A big lake inside one kommun, and every river area, stays part of the shapes.
 */
export async function drawShapes(
  kommunAreas: readonly KommunArea[],
  landAreas: readonly Feature[],
  bigLakes: readonly Feature[],
): Promise<KommunShapes> {
  const erasedWaters = await sharedWaters(kommunAreas, bigLakes);
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
      "kommuner.json": kommunCollection(kommunAreas),
      "land.json": collection(
        landAreas.map(({ geometry }) => ({ type: "Feature", properties: {}, geometry })),
      ),
      "lakes.json": collection(
        erasedWaters.map(({ geometry }) => ({ type: "Feature", properties: {}, geometry })),
      ),
    },
  );
  const drawnShapes = JSON.parse(String(output["shapes.json"])) as KommunShapes;
  const drawn = new Set(drawnShapes.features.map((feature) => feature.properties.code));
  const undrawn = kommunAreas.filter((area) => !drawn.has(area.code)).map((area) => area.code);
  if (undrawn.length > 0) throw new Error(`No shape left for ${undrawn.join(" ")}`);
  return drawnShapes;
}
