import { type KeyValueStorage, readJson, writeJson } from "../progress/storage";
import { defaultDistanceRange, type DistanceRange } from "./draw";
import { isThinkingTime, type ModeSetting } from "./linkPayload";
import { DEFAULT_THINKING_TIME } from "./modeRules";
import { isRecord } from "./storedGame";

const SETUP_KEY = "akle:free-play-setup";

/** The stored shape's format; a choice of any other format is ignored, as if none were kept. */
const SETUP_FORMAT = 1;

type ModeKind = ModeSetting["kind"];
const MODE_KINDS: readonly ModeKind[] = ["standard", "unlimited", "timed", "tie-breaker"];

/**
 * What the player last chose in free play's setup: the mode, the betänketid Tidspress takes
 * (kept while another mode is chosen) and the distance range a draw is made from.
 */
export type SetupChoice = { mode: ModeKind; thinkingTime: number; range: DistanceRange };

/** Keeps the setup choice on this device, a view preference beside, never in, any record. */
export function saveSetupChoice(storage: KeyValueStorage, choice: SetupChoice): void {
  writeJson(storage, SETUP_KEY, { format: SETUP_FORMAT, ...choice });
}

/**
 * The kept setup choice, its range cut to fit 1 to the version's `largest` distance. The
 * defaults (Standard, the default betänketid and range) when none is kept, or it's corrupt, out
 * of shape or of another format.
 */
export function restoreSetupChoice(storage: KeyValueStorage, largest: number): SetupChoice {
  const defaults: SetupChoice = {
    mode: "standard",
    thinkingTime: DEFAULT_THINKING_TIME,
    range: defaultDistanceRange(largest),
  };
  const stored = readJson(storage, SETUP_KEY);
  if (!isRecord(stored) || stored.format !== SETUP_FORMAT) return defaults;
  const { mode, thinkingTime, range } = stored;
  if (!MODE_KINDS.includes(mode as ModeKind) || !isThinkingTime(thinkingTime)) return defaults;
  if (!isRecord(range) || !isDistance(range.min) || !isDistance(range.max)) return defaults;
  if (range.min > range.max) return defaults;
  const fit = (distance: number) => Math.max(1, Math.min(distance, largest));
  return {
    mode: mode as ModeKind,
    thinkingTime,
    range: { min: fit(range.min), max: fit(range.max) },
  };
}

const isDistance = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 1;
