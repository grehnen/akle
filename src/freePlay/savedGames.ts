import { type KeyValueStorage, readJson, removeKey, writeJson } from "../progress/storage";
import { hasFormat } from "./storedGame";

/**
 * The stored list's format. A list of any other format is ignored, as if empty, so a change to
 * the shape that older code can't read bumps it; adding an optional field to a save doesn't.
 */
const SAVES_FORMAT = 1;

/** The format of the single slot a kind of game was kept in before it kept one per link. */
const LEGACY_SLOT_FORMAT = 1;

/**
 * A kind of saved game, trips or itineraries: one save per link, kept under `key` most recently
 * played first, at most `cap` of them.
 */
export type SavedGameKind<Save> = {
  key: string;
  /** Where the kind kept its one slot before; a readable slot there becomes its first save. */
  legacySlotKey: string;
  cap: number;
  /** A save as stored, when it's whole; undefined for one out of shape, which is skipped. */
  readSave: (stored: unknown) => Save | undefined;
};

/**
 * The kind's saves, most recently played first, skipping any out of shape. On first reading
 * after the upgrade, the old slot's game becomes the only save and the slot is cleared.
 */
export function readSaves<Save>(storage: KeyValueStorage, kind: SavedGameKind<Save>): Save[] {
  const stored = readJson(storage, kind.key);
  if (stored === undefined) return adoptLegacySlot(storage, kind);
  if (!hasFormat(stored, SAVES_FORMAT) || !Array.isArray(stored.saves)) {
    return [];
  }
  return stored.saves.map(kind.readSave).filter((save) => save !== undefined);
}

/**
 * Keeps `save` as the most recently played, in place of the save `isSame` finds, dropping the
 * least recently played past the cap.
 */
export function putSave<Save>(
  storage: KeyValueStorage,
  kind: SavedGameKind<Save>,
  save: Save,
  isSame: (stored: Save) => boolean,
): void {
  const others = readSaves(storage, kind).filter((stored) => !isSame(stored));
  writeSaves(storage, kind, [save, ...others]);
}

/** Makes the save `isSame` finds the most recently played, as opening its link plays it. */
export function markPlayed<Save>(
  storage: KeyValueStorage,
  kind: SavedGameKind<Save>,
  isSame: (stored: Save) => boolean,
): void {
  const saves = readSaves(storage, kind);
  const index = saves.findIndex(isSame);
  if (index <= 0) return;
  writeSaves(storage, kind, [saves[index], ...saves.filter((_, other) => other !== index)]);
}

function writeSaves<Save>(storage: KeyValueStorage, kind: SavedGameKind<Save>, saves: Save[]) {
  writeJson(storage, kind.key, { format: SAVES_FORMAT, saves: saves.slice(0, kind.cap) });
}

function adoptLegacySlot<Save>(storage: KeyValueStorage, kind: SavedGameKind<Save>): Save[] {
  if (!hasItem(storage, kind.legacySlotKey)) return [];
  const slot = readJson(storage, kind.legacySlotKey);
  const save = hasFormat(slot, LEGACY_SLOT_FORMAT) ? kind.readSave(slot) : undefined;
  if (save !== undefined) writeSaves(storage, kind, [save]);
  // Kept while its save couldn't be written, as with storage full, so it isn't lost.
  if (save === undefined || readJson(storage, kind.key) !== undefined) {
    removeKey(storage, kind.legacySlotKey);
  }
  return save === undefined ? [] : [save];
}

function hasItem(storage: KeyValueStorage, key: string): boolean {
  try {
    return storage.getItem(key) !== null;
  } catch {
    return false;
  }
}
