import { type KeyValueStorage, readJson, removeKey, writeJson } from "../progress/storage";
import type { PinnedVersion } from "./currentVersion";
import { ITINERARY_TRIPS, MAX_ITINERARY_TITLE, titleLength } from "./itineraryLink";
import type { LinkedTrip } from "./linkPayload";
import { hasFormat, isRecord, readTrip, storeTrip } from "./storedGame";
import { tripProblem } from "./tripLink";

const DRAFT_KEY = "akle:itinerary-draft";

/**
 * The stored shape's format. A draft of any other format is ignored, as if none were stored, so
 * a change to the shape that older code can't read bumps it; adding an optional field doesn't.
 */
const DRAFT_FORMAT = 1;

/** A trip in the draft, and whether it was drawn, so its pair stays hidden until Visa. */
export type DraftTrip = { trip: LinkedTrip; drawn: boolean };

/** The itinerary being built: its title as typed and its trips in order. */
export type BuilderDraft = { title: string; trips: readonly DraftTrip[] };

type StoredDraft = {
  format: typeof DRAFT_FORMAT;
  versionOrdinal: number;
  title: string;
  trips: DraftTrip[];
};

/** Keeps the draft, made on the version `versionOrdinal` names; an empty draft clears it. */
export function saveBuilderDraft(
  storage: KeyValueStorage,
  versionOrdinal: number,
  { title, trips }: BuilderDraft,
): void {
  if (title === "" && trips.length === 0) {
    clearBuilderDraft(storage);
    return;
  }
  const stored: StoredDraft = {
    format: DRAFT_FORMAT,
    versionOrdinal,
    title,
    trips: trips.map(({ trip, drawn }) => ({ trip: storeTrip(trip), drawn })),
  };
  writeJson(storage, DRAFT_KEY, stored);
}

export function clearBuilderDraft(storage: KeyValueStorage): void {
  removeKey(storage, DRAFT_KEY);
}

/**
 * The kept draft, when it was made on `version` and the builder could have made it: a title of
 * at most 40 characters and at most 20 trips, each playable on the version. Undefined when none
 * is kept, or it's outdated, corrupt or of another format.
 */
export function restoreBuilderDraft(
  storage: KeyValueStorage,
  version: PinnedVersion,
): BuilderDraft | undefined {
  const stored = readJson(storage, DRAFT_KEY);
  if (!hasFormat(stored, DRAFT_FORMAT)) return undefined;
  const { versionOrdinal, title, trips } = stored;
  if (versionOrdinal !== version.ordinal) return undefined;
  if (typeof title !== "string" || titleLength(title) > MAX_ITINERARY_TITLE) return undefined;
  if (!Array.isArray(trips) || trips.length > ITINERARY_TRIPS.max) return undefined;
  const draftTrips = trips.map((entry) => readDraftTrip(version, entry));
  if (!draftTrips.every((entry) => entry !== undefined)) return undefined;
  return { title, trips: draftTrips };
}

function readDraftTrip(version: PinnedVersion, stored: unknown): DraftTrip | undefined {
  if (!isRecord(stored) || typeof stored.drawn !== "boolean") return undefined;
  const trip = readTrip(stored.trip);
  if (trip === undefined || tripProblem(version, trip) !== undefined) return undefined;
  return { trip, drawn: stored.drawn };
}
