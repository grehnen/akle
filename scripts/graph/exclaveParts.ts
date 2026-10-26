import mapshaper from "mapshaper";
import type { KommunCode, KommunShapes } from "../../src/graph/graphVersion";
import type { ExclaveParts } from "../../src/graph/exclaveParts";
import { compareCodes } from "../../src/graph/kommunPair";
import { mainPartContains, type KommunArea, type Position } from "./sharedBorders";

type Part = { code: KommunCode; part: number };

/**
 * Which parts of each drawn shape are exclaves: those outside the main part of the kommun's OSM
 * boundary. The drawn shapes are clipped to land with shared lakes cut out, so a kommun split by a
 * lake, or one with islands, has several parts that are still in its main part. Each part is
 * tested at a point well inside it, as its edges along a border are simplified to either side.
 */
export async function exclaveParts(
  areas: readonly KommunArea[],
  shapes: KommunShapes,
): Promise<ExclaveParts> {
  const parts = shapes.features.flatMap(({ properties, geometry }) => {
    const { type, coordinates } = geometry as { type: string; coordinates: Position[][][] };
    if (type !== "MultiPolygon") return [];
    return coordinates.map((polygon, part) => ({
      type: "Feature",
      properties: { code: properties.code, part },
      geometry: { type: "Polygon", coordinates: polygon },
    }));
  });
  if (parts.length === 0) return {};
  const output = await mapshaper.applyCommands("-i parts.json -points inner -o points.json", {
    "parts.json": { type: "FeatureCollection", features: parts },
  });
  const points = JSON.parse(String(output["points.json"])).features as {
    properties: Part;
    geometry: { coordinates: Position };
  }[];
  const inMainPart = mainPartContains(areas);
  const exclaves: Record<KommunCode, number[]> = {};
  for (const { properties, geometry } of points) {
    if (inMainPart(properties.code, geometry.coordinates)) continue;
    (exclaves[properties.code] ??= []).push(properties.part);
  }
  return exclaves;
}

/** The exclave parts as committed, one kommun per line in code order. */
export function exclavePartsJson(parts: ExclaveParts): string {
  const lines = Object.entries(parts)
    .sort(([a], [b]) => compareCodes(a, b))
    .map(([code, indexes]) => `  "${code}": [${[...indexes].sort((a, b) => a - b).join(", ")}]`);
  return lines.length === 0 ? "{}\n" : `{\n${lines.join(",\n")}\n}\n`;
}
