import { latestPlayedPuzzleNumber } from "../src/daily/puzzleNumber";

/** The schedule config's epoch and the schedule rows at the base revision. */
export type ScheduleAtBase = { epoch: string; rows: readonly { number: number }[] };

/**
 * The last played puzzle (data/README.md, "Played puzzles"): today's puzzle number in UTC+14 by
 * the base revision's epoch, capped by the last puzzle the base scheduled, so 0 when the base has
 * no schedule.
 */
export function playedThroughAtBase(now: Date, base: ScheduleAtBase): number {
  const lastScheduledAtBase = base.rows.reduce((last, row) => Math.max(last, row.number), 0);
  return Math.min(latestPlayedPuzzleNumber(now, base.epoch), lastScheduledAtBase);
}

/**
 * The epoch numbers every puzzle, so it may only move while the base revision has no played
 * puzzle (data/README.md, "Played puzzles"); after launch, moving it would renumber them.
 */
export function epochChangeViolation({
  baseEpoch,
  epoch,
  playedThrough,
}: {
  baseEpoch: string;
  epoch: string;
  playedThrough: number;
}): string | undefined {
  if (epoch === baseEpoch || playedThrough === 0) return undefined;
  return `The epoch changed from ${baseEpoch} to ${epoch}, but puzzles up to #${playedThrough} are already played; it can't move after launch.`;
}
