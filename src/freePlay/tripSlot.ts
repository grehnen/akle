import type { Game } from "../engine/game";
import { type KeyValueStorage, readJson, writeJson } from "../progress/storage";
import type { PinnedVersion } from "./currentVersion";
import type { DistanceRange } from "./draw";
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

const TRIP_SLOT_KEY = "akle:free-play-trip";

/**
 * The stored shape's format. A slot of any other format is ignored, as if empty, so a change to
 * the shape that older code can't read bumps it; adding an optional field to `game` doesn't.
 */
const SLOT_FORMAT = 1;

/**
 * The trip slot as stored: the current or latest free-play trip, finished or not, on the
 * version it's pinned to. `game` holds the whole game state; a mode that keeps more (a give-up,
 * a start time, timeouts) adds its own optional fields there.
 */
type StoredSlot = {
  format: typeof SLOT_FORMAT;
  versionOrdinal: number;
  trip: LinkedTrip;
  drawn: boolean;
  range?: DistanceRange;
  game: StoredGame;
};

/** A free-play trip as the slot keeps it: its pinned version, its game and how it was set up. */
export type SavedTrip = {
  versionOrdinal: number;
  trip: LinkedTrip;
  game: Game;
  /** Drawn at random, so its result offers Slumpa ny resa. */
  drawn: boolean;
  /** The distance range a drawn trip was drawn from, which Slumpa ny resa draws from again. */
  range?: DistanceRange;
};

/** A trip opened again from the slot: its game and how it was set up. */
export type ResumedTrip = Pick<SavedTrip, "game" | "drawn" | "range">;

/** Puts a trip in the slot, replacing whatever trip it held. */
export function saveTripSlot(storage: KeyValueStorage, saved: SavedTrip): void {
  const { versionOrdinal, trip, game, drawn, range } = saved;
  const stored: StoredSlot = {
    format: SLOT_FORMAT,
    versionOrdinal,
    trip: storeTrip(trip),
    drawn,
    ...(range && { range: { min: range.min, max: range.max } }),
    game: storeGame(game),
  };
  writeJson(storage, TRIP_SLOT_KEY, stored);
}

/**
 * The slot's trip and the version ordinal it's pinned to; undefined when the slot is empty,
 * corrupt or of another format.
 */
export function storedTrip(
  storage: KeyValueStorage,
): { versionOrdinal: number; trip: LinkedTrip } | undefined {
  const slot = readSlot(storage);
  return slot && { versionOrdinal: slot.versionOrdinal, trip: slot.trip };
}

/**
 * The stored game, when the slot holds exactly this trip on this version: the same endpoints,
 * mode, thinking time and version, however its link was spelled, played under its mode's rules.
 * Its guesses, hints and give-up are checked against the version's graph; a range out of shape
 * is dropped. Undefined for any other trip, or an empty or corrupt slot.
 */
export function resumeTrip(
  storage: KeyValueStorage,
  version: PinnedVersion,
  trip: LinkedTrip,
): ResumedTrip | undefined {
  const slot = readSlot(storage);
  if (slot === undefined || slot.versionOrdinal !== version.ordinal) return undefined;
  if (!sameTrip(slot.trip, trip)) return undefined;
  const game = restoreStoredGame(version.graph, trip, trip.mode, slot.game);
  return game && { game, drawn: slot.drawn, ...(slot.range && { range: slot.range }) };
}

/** The slot, when it's whole and of this format; any part out of shape makes it unreadable. */
function readSlot(storage: KeyValueStorage): StoredSlot | undefined {
  const stored = readJson(storage, TRIP_SLOT_KEY);
  if (!isRecord(stored) || stored.format !== SLOT_FORMAT) return undefined;
  const { versionOrdinal, trip, drawn, range, game } = stored;
  if (!isCount(versionOrdinal)) return undefined;
  if (typeof drawn !== "boolean" || !isRecord(game) || !Array.isArray(game.guesses)) {
    return undefined;
  }
  const linkedTrip = readTrip(trip);
  if (linkedTrip === undefined) return undefined;
  return {
    format: SLOT_FORMAT,
    versionOrdinal,
    trip: linkedTrip,
    drawn,
    // Only a convenience for Slumpa ny resa, so one out of shape is dropped, not the trip.
    ...(isDistanceRange(range) && { range: { min: range.min, max: range.max } }),
    game: game as StoredGame,
  };
}

function isDistanceRange(value: unknown): value is DistanceRange {
  if (!isRecord(value)) return false;
  const { min, max } = value;
  return isCount(min) && isCount(max) && min >= 1 && min <= max;
}
