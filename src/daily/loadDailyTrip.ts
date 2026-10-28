import type { GraphVersion } from "../graph/graphVersion";
import {
  graphVersionFor,
  type GraphVersionFiles,
  type GraphVersionHeader,
  parseGraphVersionFiles,
} from "../graph/graphVersionFiles";
import {
  findScheduledTrip,
  parseScheduleChunk,
  type ScheduleConfig,
  scheduleChunkFor,
  type ScheduledTrip,
} from "../schedule/schedule";
import { tripNumberOn } from "./tripNumber";

/** Where the app gets its committed data from; each method is fetched on demand. */
export type DailyTripSource = {
  scheduleConfig(): Promise<ScheduleConfig>;
  /** The CSV text of a schedule chunk, or undefined when the chunk doesn't exist. */
  scheduleChunk(chunk: number): Promise<string | undefined>;
  /** The id and starting trip number of every graph version, without their data. */
  graphVersions(): Promise<readonly GraphVersionHeader[]>;
  graphVersionFiles(id: string): Promise<GraphVersionFiles>;
};

export type DailyTripLoad =
  | { kind: "trip"; trip: ScheduledTrip; graph: GraphVersion }
  | { kind: "no-trip"; reason: "before-epoch" | "schedule-ended" };

export async function loadDailyTrip(source: DailyTripSource, now: Date): Promise<DailyTripLoad> {
  const config = await source.scheduleConfig();
  const tripNumber = tripNumberOn(now, config.epoch);
  if (tripNumber < 1) return { kind: "no-trip", reason: "before-epoch" };

  const chunk = await source.scheduleChunk(scheduleChunkFor(tripNumber));
  const trip =
    chunk === undefined ? undefined : findScheduledTrip(parseScheduleChunk(chunk), tripNumber);
  if (trip === undefined) return { kind: "no-trip", reason: "schedule-ended" };

  const version = graphVersionFor(await source.graphVersions(), tripNumber);
  if (version === undefined) {
    throw new Error(`No graph version covers trip #${tripNumber}`);
  }
  return { kind: "trip", trip, graph: await loadGraphVersion(source, version) };
}

/** Fetches and parses one graph version, checking its files declare the header they're listed under. */
export async function loadGraphVersion(
  source: Pick<DailyTripSource, "graphVersionFiles">,
  version: GraphVersionHeader,
): Promise<GraphVersion> {
  const graph = parseGraphVersionFiles(await source.graphVersionFiles(version.id));
  if (graph.id !== version.id || graph.startsAtTrip !== version.startsAtTrip) {
    throw new Error(`Graph version ${version.id} declares a different id or starting trip`);
  }
  return graph;
}
