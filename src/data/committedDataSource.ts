import type { DailyPuzzleSource } from "../daily/loadDailyPuzzle";
import { parseGraphVersionHeader } from "../graph/graphVersionFiles";
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
      [...new Bun.Glob("*/version.json").scanSync(new URL("graphs", dataDirectory).pathname)].map(
        async (path) => parseGraphVersionHeader(await dataFile(`graphs/${path}`).json()),
      ),
    ),
  graphVersionFiles: async (id) => ({
    version: await dataFile(`graphs/${id}/version.json`).json(),
    kommuner: await dataFile(`graphs/${id}/kommuner.csv`).text(),
    neighbors: await dataFile(`graphs/${id}/neighbors.csv`).text(),
    shapes: await dataFile(`graphs/${id}/shapes.geojson`).json(),
  }),
};
