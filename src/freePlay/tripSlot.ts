import { type Game, giveUp, newGame, type TakenHints } from "../engine/game";
import type { KommunCode } from "../graph/graphVersion";
import { restoreGame } from "../progress/savedGame";
import { type KeyValueStorage, readJson, writeJson } from "../progress/storage";
import type { PinnedVersion } from "./currentVersion";
import { type LinkedTrip, type ModeSetting, THINKING_TIME_RANGE } from "./linkPayload";
import { freePlayRules } from "./modeRules";

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
  game: { guesses: KommunCode[]; hints?: TakenHints; givenUp?: true };
};

/** A free-play trip as the slot keeps it: its pinned version, its game and how it was set up. */
export type SavedTrip = {
  versionOrdinal: number;
  trip: LinkedTrip;
  game: Game;
  /** Drawn at random, so its result offers Slumpa ny resa. */
  drawn: boolean;
};

/** Puts a trip in the slot, replacing whatever trip it held. */
export function saveTripSlot(storage: KeyValueStorage, saved: SavedTrip): void {
  const { versionOrdinal, trip, game, drawn } = saved;
  const stored: StoredSlot = {
    format: SLOT_FORMAT,
    versionOrdinal,
    trip: { start: trip.start, destination: trip.destination, mode: trip.mode },
    drawn,
    game: {
      guesses: [...game.guesses],
      ...(game.hints && { hints: game.hints }),
      ...(game.givenUp && { givenUp: true }),
    },
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
 * Its guesses, hints and give-up are checked against the version's graph. Undefined for any other
 * trip, or an empty or corrupt slot.
 */
export function resumeTrip(
  storage: KeyValueStorage,
  version: PinnedVersion,
  trip: LinkedTrip,
): { game: Game; drawn: boolean } | undefined {
  const slot = readSlot(storage);
  if (slot === undefined || slot.versionOrdinal !== version.ordinal) return undefined;
  if (!sameTrip(slot.trip, trip)) return undefined;
  const game = restoreGame(version.graph, newGame(trip, freePlayRules(trip.mode)), slot.game);
  // A give-up counts only where the restored game still allows one.
  const resumed = slot.game.givenUp === true ? giveUp(version.graph, game) : game;
  return { game: resumed, drawn: slot.drawn };
}

function sameTrip(a: LinkedTrip, b: LinkedTrip): boolean {
  return (
    a.start === b.start &&
    a.destination === b.destination &&
    a.mode.kind === b.mode.kind &&
    thinkingTime(a.mode) === thinkingTime(b.mode)
  );
}

const thinkingTime = (mode: ModeSetting) => (mode.kind === "timed" ? mode.thinkingTime : undefined);

/** The slot, when it's whole and of this format; any part out of shape makes it unreadable. */
function readSlot(storage: KeyValueStorage): StoredSlot | undefined {
  const stored = readJson(storage, TRIP_SLOT_KEY);
  if (!isRecord(stored) || stored.format !== SLOT_FORMAT) return undefined;
  const { versionOrdinal, trip, drawn, game } = stored;
  if (!Number.isInteger(versionOrdinal) || (versionOrdinal as number) < 0) return undefined;
  if (typeof drawn !== "boolean" || !isRecord(game) || !Array.isArray(game.guesses)) {
    return undefined;
  }
  const linkedTrip = readTrip(trip);
  if (linkedTrip === undefined) return undefined;
  return {
    format: SLOT_FORMAT,
    versionOrdinal: versionOrdinal as number,
    trip: linkedTrip,
    drawn,
    game: game as StoredSlot["game"],
  };
}

function readTrip(stored: unknown): LinkedTrip | undefined {
  if (!isRecord(stored)) return undefined;
  const { start, destination, mode } = stored;
  if (typeof start !== "string" || typeof destination !== "string") return undefined;
  const setting = readMode(mode);
  return setting && { start, destination, mode: setting };
}

function readMode(stored: unknown): ModeSetting | undefined {
  if (!isRecord(stored)) return undefined;
  const { kind, thinkingTime: seconds } = stored;
  if (kind === "standard" || kind === "unlimited" || kind === "tie-breaker") return { kind };
  if (
    kind === "timed" &&
    Number.isInteger(seconds) &&
    (seconds as number) >= THINKING_TIME_RANGE.min &&
    (seconds as number) <= THINKING_TIME_RANGE.max
  ) {
    return { kind, thinkingTime: seconds as number };
  }
  return undefined;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
