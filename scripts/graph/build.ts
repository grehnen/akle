import Flatbush from "flatbush";
import mapshaper from "mapshaper";
import { mkdir } from "node:fs/promises";
import type { KommunShapes, NeighborLink } from "../../src/graph/graphVersion";
import { foldedNameCollisions } from "../../src/engine/kommunNames";
import { graphVersionDirectory } from "../../src/graph/graphVersionFiles";
import { pairKey } from "../../src/graph/kommunPair";
import buildConfig from "./build-config.json";
import { findFixedLinks, type LinkWay } from "./fixedLinks";
import { graphVersionFileContents } from "./graphVersionWriter";
import { measureLandBorders, pointOnLand } from "./landBorders";
import { readNeighborOverrides } from "./neighborOverrides";
import { reviewNeighborGraph, type BuildEvidence, type Point } from "./neighborReview";
import { readScbBoundaries } from "./scbBoundaries";
import { readScbKommunWorkbook } from "./scbKommuner";
import { closeMainlandCoastline } from "./coastlineClosure";
import {
  sharedBorders,
  sharedVertices,
  type AreaGeometry,
  type KommunArea,
  type Line,
  type Position,
  type SharedBorder,
} from "./sharedBorders";

/**
 * Rebuilds the graph version described in `build-config.json` from its pinned OSM extract:
 * land-border and fixed-link neighbors, the hand-kept ferries and overrides, official SCB names,
 * simplified shapes, and the evidence and report for the review of flagged pairs (ADR 0003).
 * See `data/README.md`.
 */

const root = new URL("../../", import.meta.url).pathname;
const cacheDirectory = `${root}.cache/osm`;
const toolsImage = "akle-osm-tools";
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

type Feature<Geometry = AreaGeometry> = {
  type: "Feature";
  properties: Record<string, string | number | undefined>;
  geometry: Geometry;
};

const extractFile = `${cacheDirectory}/${fileName(buildConfig.extract.url)}`;
const layersDirectory = `${cacheDirectory}/${buildConfig.id}`;
const outputDirectory = `${root}data/${graphVersionDirectory(buildConfig.id)}`;
const overridesFile = `${root}data/neighbor-overrides.yaml`;

await mkdir(cacheDirectory, { recursive: true });
await download(buildConfig.extract.url, extractFile, buildConfig.extract.sha256);
const scbFile = `${cacheDirectory}/${fileName(buildConfig.scbKommuner.url)}`;
await download(buildConfig.scbKommuner.url, scbFile, buildConfig.scbKommuner.sha256);
const scbBoundariesFile = `${cacheDirectory}/${fileName(buildConfig.scbBoundaries.url)}`;
await download(buildConfig.scbBoundaries.url, scbBoundariesFile, buildConfig.scbBoundaries.sha256);
await extractLayers();

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

log("Finding shared borders");
const borders = sharedBorders(areas);
const borderPairs = new Set(borders.map((border) => pairKey(border.between)));
const touchCandidates = sharedVertices(areas).filter(
  (pair) => !borderPairs.has(pairKey(pair.between)),
);
const nearBorders = borderProximity([
  ...borders,
  ...touchCandidates.map((pair) => ({
    between: pair.between,
    lines: pair.points.map((point) => [point, point]),
  })),
]);

log("Reading land and lakes");
const land = await readFeatures(`${layersDirectory}/land.geojsonseq`);
const lakes = (await readFeatures(`${layersDirectory}/water.geojsonseq`)).filter(isLake);

log("Measuring borders on land");
const mask = {
  land: land.filter((feature) => nearBorders(feature.geometry)).map((feature) => feature.geometry),
  lakes: lakes
    .filter((feature) => nearBorders(feature.geometry))
    .map((feature) => feature.geometry),
};
const measured = measureLandBorders(borders, mask);
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

log("Finding fixed links");
const linkWays: LinkWay[] = (
  await readFeatures<{ type: "LineString"; coordinates: Line }>(
    `${layersDirectory}/links.geojsonseq`,
    ["LineString"],
  )
).map((feature) => ({
  id: Number(feature.properties["@id"]),
  tags: feature.properties,
  line: feature.geometry.coordinates,
}));
const fixedLinks = findFixedLinks(borders, linkWays, mask);

log("Cross-checking with SCB's boundaries");
const scbPairs = sharedVertices(
  await readScbBoundaries(new Uint8Array(await Bun.file(scbBoundariesFile).arrayBuffer())),
).map((pair) => ({ between: pair.between, at: roundedPoint(pair.points[0]) }));

const overrides = readNeighborOverrides(await Bun.file(overridesFile).text(), scbKommuner);
const ferryLinks = overrides.ferries;
const evidence: Omit<BuildEvidence, "shapeCodes"> = {
  kommuner: scbKommuner,
  landBorders: measured.map((border) => ({
    between: border.between,
    landLength: border.landLength,
    at: [border.at[0], border.at[1]],
  })),
  pointTouches,
  fixedLinks,
  scbPairs,
};

log("Drawing shapes");
const shapes = await drawShapes(
  areas,
  land,
  lakes.filter((lake) => sphericalArea(lake.geometry) >= bigLakeArea),
);

const review = reviewNeighborGraph(
  { ...evidence, shapeCodes: shapes.features.map((feature) => feature.properties.code) },
  overrides,
);
const files = graphVersionFileContents({
  version: {
    id: buildConfig.id,
    startsAtPuzzle: buildConfig.startsAtPuzzle,
    source: {
      extract: { url: buildConfig.extract.url, sha256: buildConfig.extract.sha256, timestamp },
      names: { url: buildConfig.scbKommuner.url, sha256: buildConfig.scbKommuner.sha256 },
      crossCheck: {
        url: buildConfig.scbBoundaries.url,
        sha256: buildConfig.scbBoundaries.sha256,
      },
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
reportSummary();
log("Reviewing flagged pairs");
await Bun.$`bun ${root}scripts/graph/review.ts`.cwd(root).nothrow();

async function download(url: string, path: string, sha256: string): Promise<void> {
  if (!(await Bun.file(path).exists())) {
    log(`Downloading ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download of ${url} failed: ${response.status}`);
    await Bun.write(`${path}.part`, response);
    await Bun.$`mv ${path}.part ${path}`;
  }
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) hasher.update(chunk);
  const actual = hasher.digest("hex");
  if (actual !== sha256) {
    throw new Error(
      `${path} has sha256 ${actual}, expected ${sha256}. Delete it to download again.`,
    );
  }
}

/** Runs the native OSM tools in their pinned image; the layers are cached per graph version. */
async function extractLayers(): Promise<void> {
  const hasLand = await Bun.file(`${layersDirectory}/land.geojsonseq`).exists();
  const hasLinks = await Bun.file(`${layersDirectory}/links.geojsonseq`).exists();
  if (hasLand && hasLinks) return;
  log("Building the OSM tools image");
  await Bun.$`docker build --quiet --tag ${toolsImage} ${root}scripts/osm`.quiet();
  if (!hasLinks) {
    log("Extracting roads, paths and railways that may be fixed links");
    await runTool("links.sh", `/work/${fileName(extractFile)}`, `/work/${buildConfig.id}`);
  }
  if (hasLand) return;
  log("Extracting kommuner, water and coastline");
  await runTool("extract.sh", `/work/${fileName(extractFile)}`, `/work/${buildConfig.id}`);

  log("Closing the mainland coastline");
  const ways = (await Bun.file(`${layersDirectory}/coastline-ways.opl`).text())
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => ({
      id: line.slice(1, line.indexOf(" ")),
      nodes: line
        .slice(line.indexOf(" N") + 2)
        .split(",")
        .map((node) => node.slice(1)),
    }));
  const chainEnds = new Set(ways.flatMap((way) => [way.nodes[0], way.nodes[way.nodes.length - 1]]));
  const positions = new Map<string, Position>();
  for (const line of (await Bun.file(`${layersDirectory}/coastline-nodes.opl`).text()).split(
    "\n",
  )) {
    const node = line.slice(1, line.indexOf(" "));
    if (!chainEnds.has(node)) continue;
    const [, x, y] = / x(\S+) y(\S+)/.exec(line) ?? [];
    positions.set(node, [Number(x), Number(y)]);
  }
  const closure = closeMainlandCoastline(
    ways,
    positions,
    buildConfig.mainlandCoastlineClosure.route,
  );
  await Bun.write(
    `${layersDirectory}/coastline-dropped.txt`,
    closure.droppedWays.map((id) => `w${id}\n`).join(""),
  );
  await Bun.write(`${layersDirectory}/coastline-closure.opl`, closure.opl);

  log("Assembling land from the coastline");
  await runTool("coastline.sh", `/work/${buildConfig.id}`);
}

async function runTool(script: string, ...args: string[]): Promise<void> {
  const user = `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`;
  await Bun.$`docker run --rm --user ${user} --volume ${cacheDirectory}:/work --volume ${root}scripts/osm:/scripts:ro ${toolsImage} sh /scripts/${script} ${args}`;
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

function isLake(feature: Feature): boolean {
  const { properties } = feature;
  if (properties.natural !== "water") return false;
  return !notLakes.has(String(properties.water ?? ""));
}

/** Whether a geometry's bounding box overlaps any shared-border segment's. */
function borderProximity(shared: readonly SharedBorder[]): (geometry: AreaGeometry) => boolean {
  const segments = shared.flatMap((border) =>
    border.lines.flatMap((line) => line.slice(1).map((to, index) => [line[index], to])),
  );
  const index = new Flatbush(segments.length);
  for (const [from, to] of segments) {
    index.add(
      Math.min(from[0], to[0]),
      Math.min(from[1], to[1]),
      Math.max(from[0], to[0]),
      Math.max(from[1], to[1]),
    );
  }
  index.finish();
  return (geometry) => {
    const [west, south, east, north] = bounds(geometry);
    return index.search(west, south, east, north).length > 0;
  };
}

/** The boundaries clipped to land, with big lakes cut out, simplified for the web. */
async function drawShapes(
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
          .sort((a, b) => (a.code < b.code ? -1 : 1))
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

/** The features of a GeoJSON text sequence whose geometry is one of `geometryTypes`. */
async function readFeatures<Geometry extends { type: string } = AreaGeometry>(
  path: string,
  geometryTypes: readonly Geometry["type"][] = ["Polygon", "MultiPolygon"],
): Promise<Feature<Geometry>[]> {
  const features: Feature<Geometry>[] = [];
  const recordSeparator = String.fromCharCode(0x1e);
  const decoder = new TextDecoder();
  let pending = "";
  for await (const chunk of Bun.file(path).stream()) {
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) addFeature(line);
  }
  addFeature(pending);
  return features;

  function addFeature(line: string) {
    // osmium writes GeoJSON text sequences, where each record may start with a record separator.
    const json = (line.startsWith(recordSeparator) ? line.slice(1) : line).trim();
    if (json === "") return;
    const feature = JSON.parse(json) as Feature<Geometry>;
    if (geometryTypes.includes(feature.geometry?.type)) features.push(feature);
  }
}

function bounds(geometry: AreaGeometry): [number, number, number, number] {
  const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  const rings = geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
  for (const ring of rings) {
    for (const [x, y] of ring) {
      box[0] = Math.min(box[0], x);
      box[1] = Math.min(box[1], y);
      box[2] = Math.max(box[2], x);
      box[3] = Math.max(box[3], y);
    }
  }
  return box;
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

function reportSummary(): void {
  const names = new Map(scbKommuner.map((kommun) => [kommun.code, kommun.name]));
  const pairName = (between: readonly string[]) => between.map((code) => names.get(code)).join("–");
  const linked = new Set(landLinks.flatMap((link) => link.between));
  const isolated = scbKommuner.filter((kommun) => !linked.has(kommun.code));
  const withFixedLinks = new Set([...linked, ...fixedLinks.flatMap((link) => link.between)]);
  log(`Wrote ${outputDirectory}`);
  log(
    `${scbKommuner.length} kommuner, ${borders.length} shared borders, ${landLinks.length} land neighbors, ${fixedLinks.length} fixed links, ${ferryLinks.length} ferries`,
  );
  log(`No land neighbor: ${isolated.map((kommun) => kommun.name).join(", ") || "none"}`);
  log("Fixed links (OSM way ids):");
  for (const link of fixedLinks) {
    const alsoLand = landLinks.some((other) => other.between.join() === link.between.join());
    log(`  ${pairName(link.between)}${alsoLand ? " (also land)" : ""}: ${link.ways.join(" ")}`);
  }
  log(
    `No land neighbor or fixed link: ${
      scbKommuner
        .filter((kommun) => !withFixedLinks.has(kommun.code))
        .map((kommun) => kommun.name)
        .join(", ") || "none"
    }`,
  );
  const waterOnly = measured.filter((border) => border.landLength === 0);
  log(`Water-only borders: ${waterOnly.map((border) => pairName(border.between)).join(", ")}`);
  log(`Shapes: ${(files["shapes.geojson"].length / 1024).toFixed(0)} KB`);
}

function roundedPoint(point: Position): Point {
  return [Math.round(point[0] * 1e5) / 1e5, Math.round(point[1] * 1e5) / 1e5];
}

function fileName(url: string): string {
  return url.slice(url.lastIndexOf("/") + 1);
}

function log(message: string): void {
  console.log(`[graph] ${message}`);
}
