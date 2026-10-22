import { latestPlayedPuzzleNumber } from "../src/daily/puzzleNumber";

/**
 * The last played puzzle (data/README.md, "Played puzzles"): today's puzzle number in UTC+14,
 * capped by the last puzzle the base revision scheduled, so 0 when the base has no schedule.
 */
export function playedThroughAtBase(
  now: Date,
  epoch: string,
  baseRows: readonly { number: number }[],
): number {
  const lastScheduledAtBase = baseRows.reduce((last, row) => Math.max(last, row.number), 0);
  return Math.min(latestPlayedPuzzleNumber(now, epoch), lastScheduledAtBase);
}
