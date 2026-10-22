import type { DailyPuzzleSource } from "../daily/loadDailyPuzzle";
import {
  graphVersionDirectory,
  parseGraphVersionHeader,
  readGraphVersionFiles,
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
const versionFiles: Record<string, string> = import.meta.glob<string>(
  "/data/graphs/*/version.json",
  { eager: true, query: "?raw", import: "default" },
);
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

const graphVersionFiles: LazyText = {
  ...Object.fromEntries(
    Object.entries(versionFiles).map(([path, text]) => [path, async () => text]),
  ),
  ...kommunerFiles,
  ...neighborFiles,
  ...shapeFiles,
};

function loadFile(path: string): Promise<string> {
  const load = graphVersionFiles[path];
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
  graphVersions: async () =>
    Object.values(versionFiles).map((text) => parseGraphVersionHeader(JSON.parse(text))),
  graphVersionFiles: async (id) =>
    readGraphVersionFiles(`/data/${graphVersionDirectory(id)}`, loadFile),
};
