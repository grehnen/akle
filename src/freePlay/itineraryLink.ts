import { encodeLinkPayload, type LinkedTrip } from "./linkPayload";

/** The itinerary page: the builder without `r`, an itinerary link with it. */
export const ITINERARY_PATH = "/resplan";

/** The fewest and most trips an itinerary has (ADR 0007). */
export const ITINERARY_TRIPS = { min: 2, max: 20 } as const;

/** The longest title an itinerary can have, in characters. */
export const MAX_ITINERARY_TITLE = 40;

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
