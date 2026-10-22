import { closeMainlandCoastline } from "./coastlineClosure";
import type { AreaGeometry, Position } from "./sharedBorders";

export const repositoryRoot = new URL("../../", import.meta.url).pathname;
export const cacheDirectory = `${repositoryRoot}.cache/osm`;
const toolsImage = "akle-osm-tools";

export type Feature<Geometry = AreaGeometry> = {
  type: "Feature";
  properties: Record<string, string | number | undefined>;
  geometry: Geometry;
};

/** The last path segment of `url`, the name a download is cached under. */
export function urlFileName(url: string): string {
  return url.slice(url.lastIndexOf("/") + 1);
}

export function logBuildStep(message: string): void {
  console.log(`[graph] ${message}`);
}

/** Downloads `url` to `path` unless it is cached there, then checks its sha256. */
export async function download(url: string, path: string, sha256: string): Promise<void> {
  if (!(await Bun.file(path).exists())) {
    logBuildStep(`Downloading ${url}`);
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
export async function extractLayers({
  extractFile,
  graphVersionId,
  coastlineRoute,
}: {
  extractFile: string;
  graphVersionId: string;
  coastlineRoute: readonly Position[];
}): Promise<void> {
  const layersDirectory = `${cacheDirectory}/${graphVersionId}`;
  const hasLand = await Bun.file(`${layersDirectory}/land.geojsonseq`).exists();
  const hasLinks = await Bun.file(`${layersDirectory}/links.geojsonseq`).exists();
  if (hasLand && hasLinks) return;
  logBuildStep("Building the OSM tools image");
  await Bun.$`docker build --quiet --tag ${toolsImage} ${repositoryRoot}scripts/osm`.quiet();
  if (!hasLinks) {
    logBuildStep("Extracting roads, paths and railways that may be fixed links");
    await runTool("links.sh", `/work/${urlFileName(extractFile)}`, `/work/${graphVersionId}`);
  }
  if (hasLand) return;
  logBuildStep("Extracting kommuner, water and coastline");
  await runTool("extract.sh", `/work/${urlFileName(extractFile)}`, `/work/${graphVersionId}`);

  logBuildStep("Closing the mainland coastline");
  await writeCoastlineClosure(layersDirectory, coastlineRoute);

  logBuildStep("Assembling land from the coastline");
  await runTool("coastline.sh", `/work/${graphVersionId}`);
}

/** Reads the extracted coastline ways and chain-end nodes, and writes the closure for `coastline.sh`. */
async function writeCoastlineClosure(
  layersDirectory: string,
  coastlineRoute: readonly Position[],
): Promise<void> {
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
  const closure = closeMainlandCoastline(ways, positions, coastlineRoute);
  await Bun.write(
    `${layersDirectory}/coastline-dropped.txt`,
    closure.droppedWays.map((id) => `w${id}\n`).join(""),
  );
  await Bun.write(`${layersDirectory}/coastline-closure.opl`, closure.opl);
}

async function runTool(script: string, ...args: string[]): Promise<void> {
  const user = `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`;
  await Bun.$`docker run --rm --user ${user} --volume ${cacheDirectory}:/work --volume ${repositoryRoot}scripts/osm:/scripts:ro ${toolsImage} sh /scripts/${script} ${args}`;
}

/** The features of a GeoJSON text sequence whose geometry is one of `geometryTypes`. */
export async function readFeatures<Geometry extends { type: string } = AreaGeometry>(
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
