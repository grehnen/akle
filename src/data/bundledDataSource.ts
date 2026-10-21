import type { DailyPuzzleSource } from "../daily/loadDailyPuzzle";
import {
  graphVersionDirectory,
  graphVersionFileNames,
  parseGraphVersionHeader,
} from "../graph/graphVersionFiles";
import { parseScheduleConfig, scheduleChunkFileName } from "../schedule/schedule";
import scheduleConfig from "../../data/schedule/config.json";

type LazyText = Record<string, () => Promise<string>>;

// Vite splits each lazily globbed file into its own asset, fetched only when called. Its globs
// must be literals, so they spell out graphVersionFileNames.
const scheduleChunks: LazyText = import.meta.glob<string>("/data/schedule/*.csv", {
  query: "?raw",
  import: "default",
});
const versionHeaders: Record<string, unknown> = import.meta.glob("/data/graphs/*/version.json", {
  eager: true,
  import: "default",
});
const kommunerFiles: LazyText = import.meta.glob<string>("/data/graphs/*/kommuner.csv", {
  query: "?raw",
  import: "default",
});
const neighborFiles: LazyText = import.meta.glob<string>("/data/graphs/*/neighbors.csv", {
  query: "?raw",
  import: "default",
});
const shapeFiles: LazyText = import.meta.glob<string>("/data/graphs/*/shapes.geojson", {
  query: "?raw",
  import: "default",
});

function loadFile(files: LazyText, path: string): Promise<string> {
  const load = files[path];
  if (!load) throw new Error(`Missing data file ${path}`);
  return load();
}

/** Reads the data committed under `data/`, bundled by Vite and fetched on demand. */
export const bundledDataSource: DailyPuzzleSource = {
  scheduleConfig: async () => parseScheduleConfig(scheduleConfig),
  scheduleChunk: async (chunk) => {
    const load = scheduleChunks[`/data/schedule/${scheduleChunkFileName(chunk)}`];
    return load ? load() : undefined;
  },
  graphVersions: async () => Object.values(versionHeaders).map(parseGraphVersionHeader),
  graphVersionFiles: async (id) => {
    const directory = `/data/${graphVersionDirectory(id)}`;
    const [kommuner, neighbors, shapes] = await Promise.all([
      loadFile(kommunerFiles, `${directory}${graphVersionFileNames.kommuner}`),
      loadFile(neighborFiles, `${directory}${graphVersionFileNames.neighbors}`),
      loadFile(shapeFiles, `${directory}${graphVersionFileNames.shapes}`),
    ]);
    return {
      version: versionHeaders[`${directory}${graphVersionFileNames.version}`],
      kommuner,
      neighbors,
      shapes: JSON.parse(shapes),
    };
  },
};
