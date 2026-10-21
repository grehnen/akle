import type { DailyPuzzleSource } from "../daily/loadDailyPuzzle";
import {
  graphVersionDirectory,
  graphVersionFileNames,
  parseGraphVersionHeader,
  readGraphVersionFiles,
} from "../graph/graphVersionFiles";
import { parseScheduleConfig, scheduleChunkFileName } from "../schedule/schedule";

const dataDirectory = new URL("../../data/", import.meta.url);
const dataFile = (path: string) => Bun.file(new URL(path, dataDirectory));

/**
 * Reads the data committed under `data/` from disk, the way `bundledDataSource` reads it in the
 * browser. For tests and scripts under Bun; the app never imports it.
 */
export const committedDataSource: DailyPuzzleSource = {
  scheduleConfig: async () => parseScheduleConfig(await dataFile("schedule/config.json").json()),
  scheduleChunk: async (chunk) => {
    const file = dataFile(`schedule/${scheduleChunkFileName(chunk)}`);
    return (await file.exists()) ? file.text() : undefined;
  },
  graphVersions: async () =>
    Promise.all(
      [
        ...new Bun.Glob(`${graphVersionDirectory("*")}${graphVersionFileNames.version}`).scanSync(
          dataDirectory.pathname,
        ),
      ].map(async (path) => parseGraphVersionHeader(await dataFile(path).json())),
    ),
  graphVersionFiles: async (id) =>
    readGraphVersionFiles(graphVersionDirectory(id), (path) => dataFile(path).text()),
};
