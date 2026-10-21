import type { GraphVersion } from "../graph/graphVersion";
import {
  graphVersionFor,
  type GraphVersionFiles,
  type GraphVersionHeader,
  parseGraphVersionFiles,
} from "../graph/graphVersionFiles";
import {
  findScheduledPuzzle,
  parseScheduleChunk,
  type ScheduleConfig,
  scheduleChunkFor,
  type ScheduledPuzzle,
} from "../schedule/schedule";
import { puzzleNumberOn } from "./puzzleNumber";

/** Where the app gets its committed data from; each method is fetched on demand. */
export type DailyPuzzleSource = {
  scheduleConfig(): Promise<ScheduleConfig>;
  /** The CSV text of a schedule chunk, or undefined when the chunk doesn't exist. */
  scheduleChunk(chunk: number): Promise<string | undefined>;
  /** The id and starting puzzle number of every graph version, without their data. */
  graphVersions(): Promise<readonly GraphVersionHeader[]>;
  graphVersionFiles(id: string): Promise<GraphVersionFiles>;
};

export type DailyPuzzle =
  | { kind: "puzzle"; puzzle: ScheduledPuzzle; graph: GraphVersion }
  | { kind: "no-puzzle"; reason: "before-epoch" | "schedule-ended" };

export async function loadDailyPuzzle(source: DailyPuzzleSource, now: Date): Promise<DailyPuzzle> {
  const config = await source.scheduleConfig();
  const puzzleNumber = puzzleNumberOn(now, config.epoch);
  if (puzzleNumber < 1) return { kind: "no-puzzle", reason: "before-epoch" };

  const chunk = await source.scheduleChunk(scheduleChunkFor(puzzleNumber));
  const puzzle =
    chunk === undefined ? undefined : findScheduledPuzzle(parseScheduleChunk(chunk), puzzleNumber);
  if (puzzle === undefined) return { kind: "no-puzzle", reason: "schedule-ended" };

  const version = graphVersionFor(await source.graphVersions(), puzzleNumber);
  if (version === undefined) {
    throw new Error(`No graph version covers puzzle #${puzzleNumber}`);
  }
  const graph = parseGraphVersionFiles(await source.graphVersionFiles(version.id));
  if (graph.id !== version.id || graph.startsAtPuzzle !== version.startsAtPuzzle) {
    throw new Error(`Graph version ${version.id} declares a different id or starting puzzle`);
  }
  return { kind: "puzzle", puzzle, graph };
}
