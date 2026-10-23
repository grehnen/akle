import { latestPlayedPuzzleNumber } from "../daily/puzzleNumber";

/**
 * Days of puzzles left (ADR 0001): the scheduled puzzles after today's puzzle number in UTC+14,
 * the earliest time zone, so the count never overstates the runway anywhere. 0 when run out.
 */
export function runwayDays(rows: readonly { number: number }[], now: Date, epoch: string): number {
  const lastScheduled = rows.reduce((last, row) => Math.max(last, row.number), 0);
  return Math.max(0, lastScheduled - latestPlayedPuzzleNumber(now, epoch));
}

/** Below this many days left, the required runway check fails. */
export const minimumRunwayDays = 40;

/** Why the runway check fails, or undefined when it passes. */
export function runwayViolation(days: number): string | undefined {
  if (days >= minimumRunwayDays) return undefined;
  return `Only ${days} days of puzzles left; the runway check needs at least ${minimumRunwayDays}. Run \`bun run schedule\` and merge the extension.`;
}

/** Below this many days left, the monthly cron opens or updates the extension PR. */
export const extendBelowDays = 90;
/**
 * Below this many days left, the cron also turns on auto-merge for the extension PR: the same
 * point where the runway check starts failing.
 */
export const autoMergeBelowDays = minimumRunwayDays;

/** The cron's own open extension PR, and whether anyone but the cron has committed to it. */
export type ExtensionPullRequest = { number: number; handEdited: boolean };

export type ExtensionPlan =
  | { action: "none" }
  | { action: "open"; autoMerge: boolean }
  | { action: "update"; pullRequest: number; autoMerge: boolean }
  | { action: "comment"; pullRequest: number; autoMerge: boolean };

/**
 * What the monthly cron does, given the days left and its own open extension PR, if any. A
 * hand-edited PR is never regenerated, so the hand edits survive; the cron only comments on it.
 */
export function extensionPlan(
  days: number,
  openPullRequest: ExtensionPullRequest | undefined,
): ExtensionPlan {
  if (days >= extendBelowDays) return { action: "none" };
  const autoMerge = days < autoMergeBelowDays;
  if (openPullRequest === undefined) return { action: "open", autoMerge };
  return {
    action: openPullRequest.handEdited ? "comment" : "update",
    pullRequest: openPullRequest.number,
    autoMerge,
  };
}
