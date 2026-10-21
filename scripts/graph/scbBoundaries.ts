import { unzipSync } from "fflate";
import mapshaper from "mapshaper";
import type { KommunArea } from "./sharedBorders";

/**
 * SCB's generalised kommun boundaries (`shape_svenska_*.zip`, layer `Kommun_Sweref99TM`), in
 * WGS 84 and keyed by `KnKod`. They are only the cross-check for the neighbor graph (ADR 0002).
 */
export async function readScbBoundaries(zip: Uint8Array): Promise<KommunArea[]> {
  const inner = unzipSync(zip)["Kommun_Sweref99TM.zip"];
  if (inner === undefined) throw new Error("SCB boundaries: no Kommun_Sweref99TM.zip inside");
  const layer = unzipSync(inner);
  const inputs: Record<string, Buffer> = {};
  for (const extension of ["shp", "shx", "dbf", "prj"]) {
    const file = layer[`Kommun_Sweref99TM.${extension}`];
    if (file === undefined) throw new Error(`SCB boundaries: no .${extension} file`);
    inputs[`kommuner.${extension}`] = Buffer.from(file);
  }
  const output = await mapshaper.applyCommands(
    "-i kommuner.shp -proj wgs84 -o kommuner.json format=geojson",
    inputs,
  );
  const collection = JSON.parse(String(output["kommuner.json"])) as {
    features: { properties: { KnKod: string }; geometry: KommunArea["geometry"] }[];
  };
  return collection.features.map((feature) => ({
    code: feature.properties.KnKod,
    geometry: feature.geometry,
  }));
}
