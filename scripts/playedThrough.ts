import { latestPlayedTripNumber } from "../src/daily/tripNumber";

/** The schedule config's epoch and the schedule rows at the base revision. */
export type ScheduleAtBase = { epoch: string; rows: readonly { number: number }[] };

/**
 * The last played trip (data/README.md, "Played trips"): today's trip number in UTC+14 by
 * the base revision's epoch, capped by the last trip the base scheduled, so 0 when the base has
 * no schedule.
 */
export function playedThroughAtBase(now: Date, base: ScheduleAtBase): number {
  const lastScheduledAtBase = base.rows.reduce((last, row) => Math.max(last, row.number), 0);
  return Math.min(latestPlayedTripNumber(now, base.epoch), lastScheduledAtBase);
}

/**
 * The epoch numbers every trip, so it may only move while the base revision has no played
 * trip (data/README.md, "Played trips"); after launch, moving it would renumber them.
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
  return `The epoch changed from ${baseEpoch} to ${epoch}, but trips up to #${playedThrough} are already played; it can't move after launch.`;
}
