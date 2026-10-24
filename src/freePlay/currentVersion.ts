import { type DailyTripSource, loadGraphVersion } from "../daily/loadDailyTrip";
import { tripNumberOn } from "../daily/tripNumber";
import type { GraphVersion } from "../graph/graphVersion";
import { graphVersionFor } from "../graph/graphVersionFiles";

/**
 * Loads the current version (ADR 0006): the graph version today's trip number uses, or before
 * launch day the one trip #1 uses. Never a newer version whose first trip is still to come.
 */
export async function loadCurrentGraphVersion(
  source: Pick<DailyTripSource, "scheduleConfig" | "graphVersions" | "graphVersionFiles">,
  now: Date,
): Promise<GraphVersion> {
  const { epoch } = await source.scheduleConfig();
  const tripNumber = Math.max(1, tripNumberOn(now, epoch));
  const version = graphVersionFor(await source.graphVersions(), tripNumber);
  if (version === undefined) throw new Error(`No graph version covers trip #${tripNumber}`);
  return loadGraphVersion(source, version);
}
