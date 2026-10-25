import { reviewGame } from "../engine/game";
import type { KeyValueStorage } from "../progress/storage";
import { type Itinerary, itineraryLinkPath } from "./itineraryLink";
import type { ItineraryPlay } from "./itineraryPlay";
import type { LinkedTrip } from "./linkPayload";
import { markPlayed, putSave, readSaves, type SavedGameKind } from "./savedGames";
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

/**
 * An itinerary's save as stored: an itinerary begun, finished or not, on the version its link
 * pins, kept apart from trips' saves. `play` is where it stands, a game per trip started so far.
 */
type StoredItinerarySave = {
  versionOrdinal: number;
  title?: string;
  trips: LinkedTrip[];
  play: { current: number; games: StoredGame[] };
};

/** The itineraries kept: the 50 most recently played, each its link's one save. */
const ITINERARY_SAVES: SavedGameKind<StoredItinerarySave> = {
  key: "akle:itineraries",
  legacySlotKey: "akle:itinerary",
  cap: 50,
  readSave: readItinerarySave,
};

/** An itinerary as its save keeps it: its link's parts and its play, begun. */
export type SavedItinerary = {
  versionOrdinal: number;
  title?: string;
  trips: readonly LinkedTrip[];
  play: ItineraryPlay;
};

/**
 * Keeps an itinerary's save, replacing the one its link had and making it the most recently
 * played; an itinerary not begun gets none. Other itineraries' saves stay, but for the least
 * recently played past the cap.
 */
export function saveItinerary(storage: KeyValueStorage, saved: SavedItinerary): void {
  const { versionOrdinal, title, trips, play } = saved;
  if (!play.begun) return;
  const stored: StoredItinerarySave = {
    versionOrdinal,
    ...(title !== undefined && { title }),
    trips: trips.map(storeTrip),
    play: { current: play.current, games: play.games.map(storeGame) },
  };
  putSave(storage, ITINERARY_SAVES, stored, (other) =>
    isSaveOf(other, versionOrdinal, title, trips),
  );
}

/**
 * The saved play of exactly this itinerary: the same title, version and trips in order, however
 * its link was spelled. Each game is re-checked against the version's graph like a resumed trip,
 * and every trip but the current one must be over. Opening it makes it the most recently played.
 * Undefined for an itinerary with no readable, consistent save.
 */
export function resumeItinerary(
  storage: KeyValueStorage,
  { version, title, trips }: Itinerary,
): ItineraryPlay | undefined {
  const isSave = (save: StoredItinerarySave) => isSaveOf(save, version.ordinal, title, trips);
  const save = readSaves(storage, ITINERARY_SAVES).find(isSave);
  if (save === undefined) return undefined;
  const { current, games: stored } = save.play;
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
  markPlayed(storage, ITINERARY_SAVES, isSave);
  return { begun: true, current, games };
}

function isSaveOf(
  save: StoredItinerarySave,
  versionOrdinal: number,
  title: string | undefined,
  trips: readonly LinkedTrip[],
): boolean {
  return (
    save.versionOrdinal === versionOrdinal &&
    save.title === title &&
    save.trips.length === trips.length &&
    save.trips.every((trip, index) => sameTrip(trip, trips[index]))
  );
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
 * The most recently played itinerary while it's unfinished, from its first trip until its last
 * trip's `Avsluta resplanen`; undefined once finished, or with none saved. An older unfinished
 * itinerary never stands in for it.
 */
export function unfinishedItinerary(storage: KeyValueStorage): UnfinishedItinerary | undefined {
  const [latest] = readSaves(storage, ITINERARY_SAVES);
  if (latest === undefined || latest.play.current >= latest.trips.length) return undefined;
  const { versionOrdinal, title, trips, play } = latest;
  return {
    ...(title !== undefined && { title }),
    tripNumber: play.current + 1,
    tripCount: trips.length,
    link: itineraryLinkPath(versionOrdinal, title ?? "", trips),
  };
}

/** An itinerary's save, when it's whole; any part out of shape makes it unreadable. */
function readItinerarySave(stored: unknown): StoredItinerarySave | undefined {
  if (!isRecord(stored)) return undefined;
  const { versionOrdinal, title, trips, play } = stored;
  if (!isCount(versionOrdinal)) return undefined;
  if (title !== undefined && typeof title !== "string") return undefined;
  if (!Array.isArray(trips) || !isRecord(play)) return undefined;
  const linkedTrips = trips.map(readTrip);
  if (!linkedTrips.every((trip) => trip !== undefined)) return undefined;
  const { current, games } = play;
  if (!isCount(current) || !Array.isArray(games)) return undefined;
  return {
    versionOrdinal,
    ...(title !== undefined && { title }),
    trips: linkedTrips,
    play: { current, games },
  };
}
