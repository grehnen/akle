import type { DailyTripSource } from "../daily/loadDailyTrip";
import { kommunName } from "../graph/graphVersion";
import { loadPinnedVersion, type PinnedVersion } from "./currentVersion";
import { pickedTrip } from "./endpoints";
import { decodeLinkPayload, encodeLinkPayload, type LinkedTrip } from "./linkPayload";

/** The free-play page, which a trip link opens with its payload in `r`. */
export const FREE_PLAY_PATH = "/fri";

/** A free-play trip's link (ADR 0007): `/fri?r=<payload>`, pinned to the version it's played on. */
export function tripLinkPath(versionOrdinal: number, trip: LinkedTrip): string {
  return `${FREE_PLAY_PATH}?r=${encodeLinkPayload({ versionOrdinal, trips: [trip] })}`;
}

/** An opened trip link: its trip on its pinned version, or invalid, naming the trip when it can. */
export type OpenedTripLink =
  | { kind: "trip"; version: PinnedVersion; trip: LinkedTrip }
  | { kind: "invalid"; trip?: { start: string; destination: string } };

/**
 * Opens a trip link's payload on the version it pins (ADR 0006), never falling back to another
 * version or trip: a payload that doesn't decode, a count other than one, an ordinal no started
 * version has, a code its version lacks, or a start that is the destination or its neighbor is
 * invalid.
 */
export async function openTripLink(
  source: Pick<DailyTripSource, "scheduleConfig" | "graphVersions" | "graphVersionFiles">,
  now: Date,
  payloadText: string,
): Promise<OpenedTripLink> {
  const decoded = decodeLinkPayload(payloadText);
  if (!decoded.ok || decoded.payload.trips.length !== 1) return { kind: "invalid" };
  const [trip] = decoded.payload.trips;
  return openTrip(source, now, decoded.payload.versionOrdinal, trip);
}

/**
 * Opens a trip on the version its ordinal pins, as a link would be opened: an ordinal no started
 * version has, a code its version lacks, or a start that is the destination or its neighbor is
 * invalid.
 */
export async function openTrip(
  source: Pick<DailyTripSource, "scheduleConfig" | "graphVersions" | "graphVersionFiles">,
  now: Date,
  versionOrdinal: number,
  trip: LinkedTrip,
): Promise<OpenedTripLink> {
  const version = await loadPinnedVersion(source, now, versionOrdinal);
  if (version === undefined) return { kind: "invalid" };
  const { graph } = version;
  if (!graph.kommuner.has(trip.start) || !graph.kommuner.has(trip.destination)) {
    return { kind: "invalid" };
  }
  if (pickedTrip(graph, trip.start, trip.destination) === undefined) {
    return {
      kind: "invalid",
      trip: {
        start: kommunName(graph, trip.start),
        destination: kommunName(graph, trip.destination),
      },
    };
  }
  return { kind: "trip", version, trip };
}
