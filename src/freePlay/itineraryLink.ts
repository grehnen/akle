import type { DailyTripSource } from "../daily/loadDailyTrip";
import { loadPinnedVersion, type PinnedVersion } from "./currentVersion";
import { decodeLinkPayload, encodeLinkPayload, type LinkedTrip } from "./linkPayload";
import { type TripProblem, tripProblem } from "./tripLink";

/** The itinerary page: the builder without `r`, an itinerary link with it. */
export const ITINERARY_PATH = "/resplan";

/** The fewest and most trips an itinerary has (ADR 0007). */
export const ITINERARY_TRIPS = { min: 2, max: 20 } as const;

/** The longest title an itinerary can have, in characters (code points, so an emoji is one). */
export const MAX_ITINERARY_TITLE = 40;

/** A title's length in characters, as `MAX_ITINERARY_TITLE` counts them. */
export const titleLength = (title: string): number => [...title].length;

/**
 * A title edited from `before` to `after`, with the caret at `caret` (in UTF-16 units), kept to
 * `MAX_ITINERARY_TITLE` characters: only what the edit inserted, just before the caret, is cut
 * down to the room left, at a grapheme boundary, so nothing already there is lost and no emoji
 * sequence is split. The caret moves to the end of what was kept.
 */
export function editTitle(
  before: string,
  after: string,
  caret = after.length,
): { title: string; caret: number } {
  if (titleLength(after) <= MAX_ITINERARY_TITLE) return { title: after, caret };
  const suffix = after.slice(caret);
  const head = before.slice(0, before.length - suffix.length);
  let start = 0;
  while (start < Math.min(head.length, caret) && head[start] === after[start]) start++;
  // Never between the halves of a surrogate pair.
  if (/[\uD800-\uDBFF]$/.test(after.slice(0, start))) start--;
  const prefix = after.slice(0, start);
  let room = MAX_ITINERARY_TITLE - titleLength(prefix) - titleLength(suffix);
  let kept = "";
  const segmenter = new Intl.Segmenter("sv", { granularity: "grapheme" });
  for (const { segment } of segmenter.segment(after.slice(start, caret))) {
    room -= titleLength(segment);
    if (room < 0) break;
    kept += segment;
  }
  return { title: prefix + kept + suffix, caret: prefix.length + kept.length };
}

/**
 * An itinerary's link (ADR 0007): `/resplan?namn=<title>&r=<payload>`, all its trips pinned to
 * the one version it's made on. The title is trimmed, and left out when there's none.
 */
export function itineraryLinkPath(
  versionOrdinal: number,
  title: string,
  trips: readonly LinkedTrip[],
): string {
  const params = new URLSearchParams();
  const name = title.trim();
  if (name !== "") params.set("namn", name);
  params.set("r", encodeLinkPayload({ versionOrdinal, trips }));
  return `${ITINERARY_PATH}?${params}`;
}

/** An itinerary opened from its link, all its trips on its one pinned version. */
export type Itinerary = {
  version: PinnedVersion;
  /** The trimmed title; undefined when the link has none. */
  title?: string;
  trips: readonly LinkedTrip[];
};

/** An opened itinerary link: the itinerary, or invalid, naming a trip when it can. */
export type OpenedItineraryLink = ({ kind: "itinerary" } & Itinerary) | TripProblem;

/**
 * Opens an itinerary link's title (`namn`) and payload (`r`) on the version it pins (ADR 0006),
 * loading only that version, never falling back: a payload that doesn't decode, a count
 * outside 2–20, an ordinal no started version has, a title over 40 characters, or any trip
 * a trip link would refuse makes the whole link invalid. It names the first refused trip
 * that can be named.
 */
export async function openItineraryLink(
  source: Pick<DailyTripSource, "scheduleConfig" | "graphVersions" | "graphVersionFiles">,
  now: Date,
  namn: string | null | undefined,
  payloadText: string,
): Promise<OpenedItineraryLink> {
  const title = namn?.trim() || undefined;
  if (title !== undefined && titleLength(title) > MAX_ITINERARY_TITLE) return { kind: "invalid" };
  const decoded = decodeLinkPayload(payloadText);
  if (!decoded.ok) return { kind: "invalid" };
  const { versionOrdinal, trips } = decoded.payload;
  if (trips.length < ITINERARY_TRIPS.min || trips.length > ITINERARY_TRIPS.max) {
    return { kind: "invalid" };
  }
  const version = await loadPinnedVersion(source, now, versionOrdinal);
  if (version === undefined) return { kind: "invalid" };
  const problems = trips.flatMap((trip) => tripProblem(version, trip) ?? []);
  if (problems.length > 0) return problems.find((problem) => problem.trip) ?? problems[0];
  return { kind: "itinerary", version, title, trips };
}
