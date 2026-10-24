import { type DailyTripSource, loadGraphVersion } from "../daily/loadDailyTrip";
import { tripNumberOn } from "../daily/tripNumber";
import type { GraphVersion } from "../graph/graphVersion";
import { graphVersionFor, type GraphVersionHeader } from "../graph/graphVersionFiles";

type VersionSource = Pick<
  DailyTripSource,
  "scheduleConfig" | "graphVersions" | "graphVersionFiles"
>;

/**
 * A graph version a free-play trip is played on, with its ordinal: its position among graph
 * versions ordered by start trip, as a link pins it (ADR 0007).
 */
export type PinnedVersion = { graph: GraphVersion; ordinal: number };

/**
 * Loads the current version (ADR 0006): the graph version today's trip number uses, or before
 * launch day the one trip #1 uses. Never a newer version whose first trip is still to come.
 */
export async function loadCurrentVersion(source: VersionSource, now: Date): Promise<PinnedVersion> {
  const { versions, tripNumber } = await versionsByStart(source, now);
  const version = graphVersionFor(versions, tripNumber);
  if (version === undefined) throw new Error(`No graph version covers trip #${tripNumber}`);
  return { graph: await loadGraphVersion(source, version), ordinal: versions.indexOf(version) };
}

/**
 * Loads the graph version a link pins by its ordinal; undefined when no version has it or that
 * version hasn't started yet, so a link never plays on a version the current one doesn't reach.
 */
export async function loadPinnedVersion(
  source: VersionSource,
  now: Date,
  ordinal: number,
): Promise<PinnedVersion | undefined> {
  const { versions, tripNumber } = await versionsByStart(source, now);
  const version = versions[ordinal];
  if (version === undefined || version.startsAtTrip > tripNumber) return undefined;
  return { graph: await loadGraphVersion(source, version), ordinal };
}

/** Every graph version ordered by start trip, and the trip number that decides which have started. */
async function versionsByStart(
  source: VersionSource,
  now: Date,
): Promise<{ versions: GraphVersionHeader[]; tripNumber: number }> {
  const { epoch } = await source.scheduleConfig();
  const versions = [...(await source.graphVersions())].sort(
    (a, b) => a.startsAtTrip - b.startsAtTrip,
  );
  return { versions, tripNumber: Math.max(1, tripNumberOn(now, epoch)) };
}
