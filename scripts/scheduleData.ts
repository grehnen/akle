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
  type ScheduledTrip,
  scheduleChunkFor,
} from "../src/schedule/schedule";
import type { ScheduleAtBase } from "./playedThrough";

const dataDirectory = new URL("../data/", import.meta.url).pathname;
export const scheduleDirectory = `${dataDirectory}schedule/`;
const chunkFilePattern = /^\d{4}\.csv$/;

/** The schedule config; its per-version cooldowns must name graph versions under data/graphs. */
export async function readScheduleConfig(): Promise<ScheduleConfig> {
  return parseScheduleConfig(await Bun.file(`${scheduleDirectory}config.json`).json(), {
    graphVersionIds: graphVersionVersionFiles().map((versionFile) => versionFile.split("/")[1]),
  });
}

/** Each committed graph version's version.json, relative to data/, in id order. */
function graphVersionVersionFiles(): string[] {
  return [
    ...new Bun.Glob(`${graphVersionDirectory("*")}${graphVersionFileNames.version}`).scanSync(
      dataDirectory,
    ),
  ].sort();
}

export async function readGraphVersions(): Promise<GraphVersion[]> {
  return Promise.all(
    graphVersionVersionFiles().map(async (versionFile) => {
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

/** Every committed schedule row, in trip order, from the working tree. */
export async function readScheduleRows(): Promise<ScheduledTrip[]> {
  const fileNames = [...new Bun.Glob("*.csv").scanSync(scheduleDirectory)];
  const files = await Promise.all(
    fileNames.map(async (fileName) => ({
      fileName,
      csv: await Bun.file(`${scheduleDirectory}${fileName}`).text(),
    })),
  );
  return rowsFromChunkFiles(files);
}

/** Every schedule row at a git revision, in trip order; none if it has no schedule. */
export function readScheduleRowsAt(revision: string): ScheduledTrip[] {
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

/**
 * The epoch and schedule rows at a git revision, for counting played trips. A revision without
 * a schedule config has no played trip, so `currentEpoch` stands in for its epoch.
 */
export function readScheduleAt(
  revision: string,
  currentEpoch: string,
): ScheduleAtBase & { rows: ScheduledTrip[] } {
  const hasConfig = git(["ls-tree", "--name-only", revision, "data/schedule/config.json"]) !== "";
  const epoch = hasConfig
    ? parseScheduleConfig(JSON.parse(git(["show", `${revision}:data/schedule/config.json`]))).epoch
    : currentEpoch;
  return { epoch, rows: readScheduleRowsAt(revision) };
}

/** Writes every chunk that holds a row; earlier chunk files stay as they are when unchanged. */
export async function writeScheduleRows(rows: readonly ScheduledTrip[]): Promise<void> {
  for (const { fileName, csv } of formatScheduleChunks(rows)) {
    await Bun.write(`${scheduleDirectory}${fileName}`, csv);
  }
}

function rowsFromChunkFiles(files: { fileName: string; csv: string }[]): ScheduledTrip[] {
  const rows = files
    .filter(({ fileName }) => chunkFilePattern.test(fileName))
    .sort((a, b) => a.fileName.localeCompare(b.fileName))
    .flatMap(({ fileName, csv }) => {
      const chunk = Number(fileName.slice(0, 4));
      const chunkRows = parseScheduleChunk(csv);
      const misplaced = chunkRows.find((row) => scheduleChunkFor(row.number) !== chunk);
      if (misplaced) {
        throw new Error(`Trip #${misplaced.number} does not belong in ${fileName}`);
      }
      return chunkRows;
    });
  return rows;
}

export function git(args: string[]): string {
  return run(["git", ...args]);
}

/** Runs a command, with `stdin` as its input if given, and returns its output; throws if it fails. */
export function run(command: string[], stdin?: string): string {
  const result = Bun.spawnSync(command, {
    stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin),
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed: ${result.stderr.toString()}`);
  }
  return result.stdout.toString();
}

/**
 * The `--base` revision the checks compare with, HEAD by default, and the `--now` they check at.
 * A push that creates a branch has no previous revision: GitHub sends all zeros.
 */
export function checkArguments(): { base: string; now: Date } {
  const requestedBase = argument("base") ?? "";
  const base = requestedBase === "" || /^0+$/.test(requestedBase) ? "HEAD" : requestedBase;
  return { base, now: new Date(argument("now") ?? Date.now()) };
}

/** The value after `--name` on the command line, if given. */
export function argument(name: string): string | undefined {
  const index = Bun.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : Bun.argv[index + 1];
}
