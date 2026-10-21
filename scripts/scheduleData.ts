import type { GraphVersion } from "../src/graph/graphVersion";
import {
  graphVersionDirectory,
  graphVersionFileNames,
  parseGraphVersionFiles,
  readGraphVersionFiles,
} from "../src/graph/graphVersionFiles";
import {
  formatScheduleChunks,
  parseScheduleChunk,
  parseScheduleConfig,
  type ScheduleConfig,
  type ScheduledPuzzle,
  scheduleChunkFor,
} from "../src/schedule/schedule";

const dataDirectory = new URL("../data/", import.meta.url).pathname;
export const scheduleDirectory = `${dataDirectory}schedule/`;
const chunkFilePattern = /^\d{4}\.csv$/;

export async function readScheduleConfig(): Promise<ScheduleConfig> {
  return parseScheduleConfig(await Bun.file(`${scheduleDirectory}config.json`).json());
}

export async function readGraphVersions(): Promise<GraphVersion[]> {
  const versionFiles = [
    ...new Bun.Glob(`${graphVersionDirectory("*")}${graphVersionFileNames.version}`).scanSync(
      dataDirectory,
    ),
  ].sort();
  return Promise.all(
    versionFiles.map(async (versionFile) => {
      const directory = `${dataDirectory}${versionFile.slice(0, -graphVersionFileNames.version.length)}`;
      const graph = parseGraphVersionFiles(
        await readGraphVersionFiles(directory, (path) => Bun.file(path).text()),
      );
      if (!directory.endsWith(`/${graph.id}/`)) {
        throw new Error(`${versionFile}: id "${graph.id}" must match its directory name`);
      }
      return graph;
    }),
  );
}

/** Every committed schedule row, in puzzle order, from the working tree. */
export async function readScheduleRows(): Promise<ScheduledPuzzle[]> {
  const fileNames = [...new Bun.Glob("*.csv").scanSync(scheduleDirectory)];
  const files = await Promise.all(
    fileNames.map(async (fileName) => ({
      fileName,
      csv: await Bun.file(`${scheduleDirectory}${fileName}`).text(),
    })),
  );
  return rowsFromChunkFiles(files);
}

/** Every schedule row at a git revision, in puzzle order; none if it has no schedule. */
export function readScheduleRowsAt(revision: string): ScheduledPuzzle[] {
  const listing = git(["ls-tree", "--name-only", revision, "data/schedule/"]);
  const fileNames = listing
    .split("\n")
    .map((path) => path.replace("data/schedule/", ""))
    .filter((fileName) => chunkFilePattern.test(fileName));
  return rowsFromChunkFiles(
    fileNames.map((fileName) => ({
      fileName,
      csv: git(["show", `${revision}:data/schedule/${fileName}`]),
    })),
  );
}

/** Writes every chunk that holds a row; earlier chunk files stay as they are when unchanged. */
export async function writeScheduleRows(rows: readonly ScheduledPuzzle[]): Promise<void> {
  for (const { fileName, csv } of formatScheduleChunks(rows)) {
    await Bun.write(`${scheduleDirectory}${fileName}`, csv);
  }
}

function rowsFromChunkFiles(files: { fileName: string; csv: string }[]): ScheduledPuzzle[] {
  const rows = files
    .filter(({ fileName }) => chunkFilePattern.test(fileName))
    .sort((a, b) => a.fileName.localeCompare(b.fileName))
    .flatMap(({ fileName, csv }) => {
      const chunk = Number(fileName.slice(0, 4));
      const chunkRows = parseScheduleChunk(csv);
      const misplaced = chunkRows.find((row) => scheduleChunkFor(row.number) !== chunk);
      if (misplaced) {
        throw new Error(`Puzzle #${misplaced.number} does not belong in ${fileName}`);
      }
      return chunkRows;
    });
  return rows;
}

export function git(args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString()}`);
  }
  return result.stdout.toString();
}

/** The value after `--name` on the command line, if given. */
export function argument(name: string): string | undefined {
  const index = Bun.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : Bun.argv[index + 1];
}
