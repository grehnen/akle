import type { KommunCode, NeighborLink } from "../../src/graph/graphVersion";
import { pairKey } from "../../src/graph/kommunPair";
import type { FixedLink } from "./fixedLinks";
import type { LandBorder } from "./landBorders";
import { logBuildStep } from "./osmTools";
import type { SharedBorder } from "./sharedBorders";

/** What the build logs once the graph version is written: counts, gaps and the fixed links. */
export function reportBuild({
  outputDirectory,
  kommuner,
  borders,
  measured,
  landLinks,
  fixedLinks,
  ferryCount,
  shapesGeojson,
}: {
  outputDirectory: string;
  kommuner: readonly { code: KommunCode; name: string }[];
  borders: readonly SharedBorder[];
  measured: readonly LandBorder[];
  landLinks: readonly NeighborLink[];
  fixedLinks: readonly FixedLink[];
  ferryCount: number;
  shapesGeojson: string;
}): void {
  const names = new Map(kommuner.map((kommun) => [kommun.code, kommun.name]));
  const pairName = (between: readonly string[]) => between.map((code) => names.get(code)).join("–");
  const linked = new Set(landLinks.flatMap((link) => link.between));
  const isolated = kommuner.filter((kommun) => !linked.has(kommun.code));
  const withFixedLinks = new Set([...linked, ...fixedLinks.flatMap((link) => link.between)]);
  logBuildStep(`Wrote ${outputDirectory}`);
  logBuildStep(
    `${kommuner.length} kommuner, ${borders.length} shared borders, ${landLinks.length} land neighbors, ${fixedLinks.length} fixed links, ${ferryCount} ferries`,
  );
  logBuildStep(`No land neighbor: ${isolated.map((kommun) => kommun.name).join(", ") || "none"}`);
  logBuildStep("Fixed links (OSM way ids):");
  for (const link of fixedLinks) {
    const alsoLand = landLinks.some((other) => pairKey(other.between) === pairKey(link.between));
    logBuildStep(
      `  ${pairName(link.between)}${alsoLand ? " (also land)" : ""}: ${link.ways.join(" ")}`,
    );
  }
  logBuildStep(
    `No land neighbor or fixed link: ${
      kommuner
        .filter((kommun) => !withFixedLinks.has(kommun.code))
        .map((kommun) => kommun.name)
        .join(", ") || "none"
    }`,
  );
  const waterOnly = measured.filter((border) => border.landLength === 0);
  logBuildStep(
    `Water-only borders: ${waterOnly.map((border) => pairName(border.between)).join(", ")}`,
  );
  logBuildStep(`Shapes: ${(shapesGeojson.length / 1024).toFixed(0)} KB`);
}
