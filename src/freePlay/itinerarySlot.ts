import { reviewGame } from "../engine/game";
import { type KeyValueStorage, readJson, writeJson } from "../progress/storage";
import { type Itinerary, itineraryLinkPath } from "./itineraryLink";
import type { ItineraryPlay } from "./itineraryPlay";
import type { LinkedTrip } from "./linkPayload";
import {
  isCount,
  isRecord,
  readTrip,
  restoreStoredGame,
  sameTrip,
  type StoredGame,
  storeGame,
  storeTrip,
} from "./storedGame";

const ITINERARY_SLOT_KEY = "akle:itinerary";

/**
 * The stored shape's format. A slot of any other format is ignored, as if empty, so a change to
 * the shape that older code can't read bumps it; adding an optional field doesn't.
 */
const SLOT_FORMAT = 1;

/**
 * The itinerary slot as stored: the current or latest itinerary, finished or not, on the version
 * its link pins, kept apart from the trip slot. `play` is where it stands, a game per trip
 * started so far.
 */
type StoredSlot = {
  format: typeof SLOT_FORMAT;
  versionOrdinal: number;
  title?: string;
  trips: LinkedTrip[];
  play: { current: number; games: StoredGame[] };
};

/** An itinerary as the slot keeps it: its link's parts and its play, begun. */
export type SavedItinerary = {
  versionOrdinal: number;
  title?: string;
  trips: readonly LinkedTrip[];
  play: ItineraryPlay;
};

/** Puts an itinerary in the slot, replacing whatever it held; an itinerary not begun isn't. */
export function saveItinerarySlot(storage: KeyValueStorage, saved: SavedItinerary): void {
  const { versionOrdinal, title, trips, play } = saved;
  if (!play.begun) return;
  const stored: StoredSlot = {
    format: SLOT_FORMAT,
    versionOrdinal,
    ...(title !== undefined && { title }),
    trips: trips.map(storeTrip),
    play: { current: play.current, games: play.games.map(storeGame) },
  };
  writeJson(storage, ITINERARY_SLOT_KEY, stored);
}

/**
 * The stored play, when the slot holds exactly this itinerary: the same title, version and
 * trips in order, however its link was spelled. Each game is re-checked against the version's
 * graph like a resumed trip, and every trip but the current one must be over. Undefined for any
 * other itinerary, or an empty, corrupt or inconsistent slot.
 */
export function resumeItinerary(
  storage: KeyValueStorage,
  { version, title, trips }: Itinerary,
): ItineraryPlay | undefined {
  const slot = readSlot(storage);
  if (slot === undefined || slot.versionOrdinal !== version.ordinal || slot.title !== title) {
    return undefined;
  }
  if (slot.trips.length !== trips.length || !slot.trips.every((t, i) => sameTrip(t, trips[i]))) {
    return undefined;
  }
  const { current, games: stored } = slot.play;
  // On a trip's card no game is started for it yet; on its board or result one is.
  if (current > trips.length || (stored.length !== current && stored.length !== current + 1)) {
    return undefined;
  }
  if (stored.length > trips.length) return undefined;
  const games = [];
  for (const [index, storedGame] of stored.entries()) {
    // Every trip of an itinerary opens at its Starta, so every game has a start.
    if (!isRecord(storedGame) || typeof storedGame.startedAt !== "number") return undefined;
    // An itinerary's game is of the plain trip, its mode coming from the itinerary.
    const { start, destination, mode } = trips[index];
    const game = restoreStoredGame(version.graph, { start, destination }, mode, storedGame);
    if (game === undefined) return undefined;
    // Only the current trip can still be played: `Nästa resa` waits for a trip's end.
    if (index < current && reviewGame(version.graph, game).status === "playing") return undefined;
    games.push(game);
  }
  return { begun: true, current, games };
}

/** An itinerary left unfinished: where it stands and the link that resumes it. */
export type UnfinishedItinerary = {
  title?: string;
  /** The trip it is on, counted from 1, of `tripCount`. */
  tripNumber: number;
  tripCount: number;
  link: string;
};

/**
 * The stored itinerary while it's unfinished, from its first trip's card until its last trip's
 * `Avsluta resplanen`; undefined once finished, or with none stored.
 */
export function unfinishedItinerary(storage: KeyValueStorage): UnfinishedItinerary | undefined {
  const slot = readSlot(storage);
  if (slot === undefined || slot.play.current >= slot.trips.length) return undefined;
  const { versionOrdinal, title, trips, play } = slot;
  return {
    ...(title !== undefined && { title }),
    tripNumber: play.current + 1,
    tripCount: trips.length,
    link: itineraryLinkPath(versionOrdinal, title ?? "", trips),
  };
}

/** The slot, when it's whole and of this format; any part out of shape makes it unreadable. */
function readSlot(storage: KeyValueStorage): StoredSlot | undefined {
  const stored = readJson(storage, ITINERARY_SLOT_KEY);
  if (!isRecord(stored) || stored.format !== SLOT_FORMAT) return undefined;
  const { versionOrdinal, title, trips, play } = stored;
  if (!isCount(versionOrdinal)) return undefined;
  if (title !== undefined && typeof title !== "string") return undefined;
  if (!Array.isArray(trips) || !isRecord(play)) return undefined;
  const linkedTrips = trips.map(readTrip);
  if (!linkedTrips.every((trip) => trip !== undefined)) return undefined;
  const { current, games } = play;
  if (!isCount(current) || !Array.isArray(games)) return undefined;
  return {
    format: SLOT_FORMAT,
    versionOrdinal,
    ...(title !== undefined && { title }),
    trips: linkedTrips,
    play: { current, games },
  };
}
