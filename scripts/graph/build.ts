import { mkdir } from "node:fs/promises";
import type { NeighborLink } from "../../src/graph/graphVersion";
import { foldedNameCollisions } from "../../src/engine/kommunNames";
import { graphVersionDirectory, graphVersionFileNames } from "../../src/graph/graphVersionFiles";
import { pairKey } from "../../src/graph/kommunPair";
import buildConfig from "./build-config.json";
import { reportBuild } from "./buildReport";
import { crossesABorder, findFixedLinks, type LinkWay } from "./fixedLinks";
import { graphVersionFileContents } from "./graphVersionWriter";
import { lineProximity, measureLandBorders, pointOnLand, roundedPoint } from "./landBorders";
import { readNeighborOverrides } from "./neighborOverrides";
import { reviewNeighborGraph, type BuildEvidence } from "./neighborReview";
import {
  cacheDirectory,
  download,
  extractLayers,
  urlFileName,
  logBuildStep,
  readFeatures,
  repositoryRoot,
} from "./osmTools";
import { readScbKommunWorkbook } from "./scbKommuner";
import { drawShapes, isBigLake, isInlandWater, isRiver } from "./shapes";
import {
  exclaveEdges,
  mainPartContains,
  sharedBorders,
  sharedVertices,
  type AreaGeometry,
  type KommunArea,
  type Line,
} from "./sharedBorders";

/**
 * Rebuilds the graph version described in `build-config.json` from its pinned OSM extract:
 * land-border and fixed-link neighbors, the hand-kept ferries and overrides, official SCB names,
 * simplified shapes, and the evidence and report for the review of flagged pairs (ADR 0003).
 * See `data/README.md`.
 */

const extractFile = `${cacheDirectory}/${urlFileName(buildConfig.extract.url)}`;
const layersDirectory = `${cacheDirectory}/${buildConfig.id}`;
const outputDirectory = `${repositoryRoot}data/${graphVersionDirectory(buildConfig.id)}`;
const overridesFile = `${repositoryRoot}data/neighbor-overrides.yaml`;

await mkdir(cacheDirectory, { recursive: true });
await download(buildConfig.extract.url, extractFile, buildConfig.extract.sha256);
const scbFile = `${cacheDirectory}/${urlFileName(buildConfig.scbKommuner.url)}`;
await download(buildConfig.scbKommuner.url, scbFile, buildConfig.scbKommuner.sha256);
await extractLayers({
  extractFile,
  graphVersionId: buildConfig.id,
  coastlineRoute: buildConfig.mainlandCoastlineClosure.route,
});

const fileInfo = await Bun.file(`${layersDirectory}/fileinfo.json`).json();
const timestamp: string = fileInfo.header.option.osmosis_replication_timestamp;

const scbKommuner = readScbKommunWorkbook(new Uint8Array(await Bun.file(scbFile).arrayBuffer()));
const areas = await readKommunAreas();
checkCodesMatch(
  areas.map((area) => area.code),
  scbKommuner.map((kommun) => kommun.code),
);
const collisions = foldedNameCollisions(scbKommuner.map((kommun) => kommun.name));
if (collisions.length > 0) {
  throw new Error(`Kommun names collide after accent folding: ${JSON.stringify(collisions)}`);
}

logBuildStep("Finding shared borders");
const borders = sharedBorders(areas);
const borderPairs = new Set(borders.map((border) => pairKey(border.between)));
const touchCandidates = sharedVertices(areas).filter(
  (pair) => !borderPairs.has(pairKey(pair.between)),
);
const nearBorders = lineProximity([
  ...borders.flatMap((border) => border.lines),
  ...touchCandidates.flatMap((pair) => pair.points.map((point) => [point, point])),
]);

logBuildStep("Reading land, lakes and rivers");
const land = await readFeatures(`${layersDirectory}/land.geojsonseq`);
const lakes = (await readFeatures(`${layersDirectory}/water.geojsonseq`)).filter(isInlandWater);

logBuildStep("Measuring borders on land");
const mask = {
  land: land.filter((feature) => nearBorders(feature.geometry)).map((feature) => feature.geometry),
  lakes: lakes
    .filter((feature) => nearBorders(feature.geometry))
    .map((feature) => feature.geometry),
  rivers: lakes
    .filter((feature) => isRiver(feature) && nearBorders(feature.geometry))
    .map((feature) => feature.geometry),
};
const measured = measureLandBorders(borders, mask, exclaveEdges(areas));
await Bun.write(
  `${layersDirectory}/land-borders.csv`,
  `a,b,landLength\n${measured.map((border) => `${border.between.join(",")},${border.landLength}`).join("\n")}\n`,
);
const isOnLand = pointOnLand(mask);
const pointTouches = touchCandidates.flatMap((pair) => {
  const onLand = pair.points.find(isOnLand);
  return onLand ? [{ between: pair.between, at: roundedPoint(onLand) }] : [];
});
const landLinks: NeighborLink[] = measured
  .filter((border) => border.landLength > 0)
  .map((border) => ({ between: border.between, kind: "land" }));

logBuildStep("Finding fixed links");
const linkWays = await readLinkWays("ways.geojsonseq", crossesABorder(borders));
const network = [...linkWays, ...(await readLinkWays("roads.geojsonseq"))];
// The ends of a link may reach land well away from the border, so its mask also covers the land
// and lakes around the ways an end can follow.
const nearLinks = lineProximity(network.map((way) => way.line));
const near = (feature: { geometry: AreaGeometry }) =>
  nearBorders(feature.geometry) || nearLinks(feature.geometry);
const fixedLinks = findFixedLinks(
  borders,
  linkWays,
  {
    land: land.filter(near).map((feature) => feature.geometry),
    lakes: lakes.filter(near).map((feature) => feature.geometry),
  },
  network,
  mainPartContains(areas),
);

const overrides = readNeighborOverrides(await Bun.file(overridesFile).text(), scbKommuner);
const ferryLinks = overrides.ferries;
const evidence: Omit<BuildEvidence, "shapeCodes"> = {
  kommuner: scbKommuner,
  landBorders: measured.map((border) => ({ ...border, at: [border.at[0], border.at[1]] })),
  pointTouches,
  fixedLinks,
};

logBuildStep("Drawing shapes");
const shapes = await drawShapes(areas, land, lakes.filter(isBigLake));

const review = reviewNeighborGraph(
  { ...evidence, shapeCodes: shapes.features.map((feature) => feature.properties.code) },
  overrides,
);
const files = graphVersionFileContents({
  version: {
    id: buildConfig.id,
    startsAtTrip: buildConfig.startsAtTrip,
    source: {
      extract: { url: buildConfig.extract.url, sha256: buildConfig.extract.sha256, timestamp },
      names: { url: buildConfig.scbKommuner.url, sha256: buildConfig.scbKommuner.sha256 },
      license: "Borders and shapes © OpenStreetMap contributors, ODbL 1.0",
    },
  },
  kommuner: scbKommuner,
  links: review.links,
  fixedLinks,
  shapes,
  evidence,
});
await mkdir(outputDirectory, { recursive: true });
for (const [name, content] of Object.entries(files)) {
  await Bun.write(`${outputDirectory}${name}`, content);
}
reportBuild({
  outputDirectory,
  kommuner: scbKommuner,
  borders,
  measured,
  landLinks,
  fixedLinks,
  ferryCount: ferryLinks.length,
  shapesGeojson: files[graphVersionFileNames.shapes],
});
logBuildStep("Reviewing flagged pairs");
await Bun.$`bun ${repositoryRoot}scripts/graph/review.ts`.cwd(repositoryRoot).nothrow();

async function readLinkWays(
  fileName: string,
  keep: (way: LinkWay) => boolean = () => true,
): Promise<LinkWay[]> {
  const ways: LinkWay[] = [];
  await readFeatures<{ type: "LineString"; coordinates: Line }>(
    `${layersDirectory}/${fileName}`,
    ["LineString"],
    (feature) => {
      const way = {
        id: Number(feature.properties["@id"]),
        tags: feature.properties,
        line: feature.geometry.coordinates,
      };
      if (keep(way)) ways.push(way);
      return false;
    },
  );
  return ways;
}

async function readKommunAreas(): Promise<KommunArea[]> {
  const byCode = new Map<string, KommunArea>();
  for (const feature of await readFeatures(`${layersDirectory}/kommuner.geojsonseq`)) {
    const { properties } = feature;
    if (properties["@type"] !== "relation" || properties.admin_level !== "7") continue;
    const code = properties["ref:scb"];
    if (typeof code !== "string") continue;
    if (byCode.has(code)) throw new Error(`Two OSM boundaries have ref:scb=${code}`);
    byCode.set(code, { code, geometry: feature.geometry });
  }
  return [...byCode.values()];
}

function checkCodesMatch(osmCodes: string[], scbCodes: string[]): void {
  const missing = scbCodes.filter((code) => !osmCodes.includes(code));
  const extra = osmCodes.filter((code) => !scbCodes.includes(code));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `OSM kommuner don't match SCB's list: missing ${missing.join(" ")}; extra ${extra.join(" ")}`,
    );
  }
}
