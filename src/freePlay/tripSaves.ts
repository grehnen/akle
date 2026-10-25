import type { Game } from "../engine/game";
import { type KeyValueStorage, readJson, writeJson } from "../progress/storage";
import type { PinnedVersion } from "./currentVersion";
import type { DistanceRange } from "./draw";
import type { LinkedTrip } from "./linkPayload";
import { markPlayed, putSave, readSaves, type SavedGameKind } from "./savedGames";
import {
  isCount,
  isDistanceRange,
  isRecord,
  readTrip,
  restoreStoredGame,
  sameTrip,
  type StoredGame,
  storeGame,
  storeRange,
  storeTrip,
} from "./storedGame";

/**
 * A trip's save as stored: a free-play trip, finished or not, on the version it's pinned to.
 * `game` holds the whole game state; a mode that keeps more (a give-up, a start time, timeouts)
 * adds its own optional fields there.
 */
type StoredTripSave = {
  versionOrdinal: number;
  trip: LinkedTrip;
  drawn: boolean;
  range?: DistanceRange;
  game: StoredGame;
};

/** The trips kept: the 100 most recently played, each its link's one save. */
const TRIP_SAVES: SavedGameKind<StoredTripSave> = {
  key: "akle:free-play-trips",
  legacySlotKey: "akle:free-play-trip",
  cap: 100,
  readSave: readTripSave,
};

/** A free-play trip as its save keeps it: its pinned version, its game and how it was set up. */
export type SavedTrip = {
  versionOrdinal: number;
  trip: LinkedTrip;
  game: Game;
  /** Drawn at random, so its result offers Slumpa ny resa. */
  drawn: boolean;
  /** The distance range a drawn trip was drawn from, which Slumpa ny resa draws from again. */
  range?: DistanceRange;
};

/** A trip opened again from its save: its game and how it was set up. */
export type ResumedTrip = Pick<SavedTrip, "game" | "drawn" | "range">;

/**
 * Keeps a trip's save, replacing the one its link had and making it the most recently played;
 * other trips' saves stay, but for the least recently played past the cap.
 */
export function saveTrip(storage: KeyValueStorage, saved: SavedTrip): void {
  const { versionOrdinal, trip, game, drawn, range } = saved;
  const stored: StoredTripSave = {
    versionOrdinal,
    trip: storeTrip(trip),
    drawn,
    ...(range && { range: storeRange(range) }),
    game: storeGame(game),
  };
  putSave(storage, TRIP_SAVES, stored, (other) => isSaveOf(other, versionOrdinal, trip));
}

/**
 * The most recently played trip and the version ordinal it's pinned to; undefined with no
 * readable save.
 */
export function latestTrip(
  storage: KeyValueStorage,
): { versionOrdinal: number; trip: LinkedTrip } | undefined {
  const [latest] = readSaves(storage, TRIP_SAVES);
  return latest && { versionOrdinal: latest.versionOrdinal, trip: latest.trip };
}

/**
 * The saved game of exactly this trip on this version: the same endpoints, mode, thinking time
 * and version, however its link was spelled, played under its mode's rules. Its guesses, hints
 * and give-up are checked against the version's graph; a range out of shape is dropped. Opening
 * it makes it the most recently played. Undefined for a trip with no readable save.
 */
export function resumeTrip(
  storage: KeyValueStorage,
  version: PinnedVersion,
  trip: LinkedTrip,
): ResumedTrip | undefined {
  const isSave = (save: StoredTripSave) => isSaveOf(save, version.ordinal, trip);
  const save = readSaves(storage, TRIP_SAVES).find(isSave);
  if (save === undefined) return undefined;
  const game = restoreStoredGame(version.graph, trip, trip.mode, save.game);
  if (game === undefined) return undefined;
  markPlayed(storage, TRIP_SAVES, isSave);
  return { game, drawn: save.drawn, ...(save.range && { range: save.range }) };
}

function isSaveOf(save: StoredTripSave, versionOrdinal: number, trip: LinkedTrip): boolean {
  return save.versionOrdinal === versionOrdinal && sameTrip(save.trip, trip);
}

const DRAWN_AT_STARTA_KEY = "akle:free-play-drawn-at-starta";

/**
 * Notes, for this browser session, the range the trip behind Starta at `link` was drawn from:
 * a trip gets its save only at Starta, so a reload or Back and Forward over the gate would
 * otherwise forget that it was drawn.
 */
export function noteDrawnAtStarta(
  sessionStorage: KeyValueStorage,
  link: string,
  range: DistanceRange,
): void {
  writeJson(sessionStorage, DRAWN_AT_STARTA_KEY, { link, range: storeRange(range) });
}

/** The range the trip behind Starta at `link` was drawn from, when noted this session. */
export function drawnAtStarta(
  sessionStorage: KeyValueStorage,
  link: string,
): DistanceRange | undefined {
  const noted = readJson(sessionStorage, DRAWN_AT_STARTA_KEY);
  if (!isRecord(noted) || noted.link !== link || !isDistanceRange(noted.range)) return undefined;
  return storeRange(noted.range);
}

/** A trip's save, when it's whole; any part out of shape makes it unreadable. */
function readTripSave(stored: unknown): StoredTripSave | undefined {
  if (!isRecord(stored)) return undefined;
  const { versionOrdinal, trip, drawn, range, game } = stored;
  if (!isCount(versionOrdinal)) return undefined;
  if (typeof drawn !== "boolean" || !isRecord(game) || !Array.isArray(game.guesses)) {
    return undefined;
  }
  const linkedTrip = readTrip(trip);
  if (linkedTrip === undefined) return undefined;
  return {
    versionOrdinal,
    trip: linkedTrip,
    drawn,
    // Only a convenience for Slumpa ny resa, so one out of shape is dropped, not the trip.
    ...(isDistanceRange(range) && { range: storeRange(range) }),
    game: game as StoredGame,
  };
}
