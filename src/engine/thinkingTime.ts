import type { Game } from "./game";

/**
 * The timeouts of a timed game, as runs: how many thinking times ran out before each counted
 * guess, then how many since the last one. Everything comes from timestamps (Starta, each counted
 * guess, the end) and `now`, so thinking times that ran out while the page was hidden, asleep
 * or closed count as soon as it is back. Without `now`, the last run ends at the last guess, or at
 * the end once the game is over. A game with no thinking time, or not started, has none.
 */
export function timeoutRuns(game: Game, now?: number): number[] {
  const marks = thinkingTimeMarks(game);
  if (marks === undefined) return Array<number>(game.guesses.length + 1).fill(0);
  const { stamps, last, thinkingMs } = marks;
  const end = game.endedAt ?? now ?? last;
  return stamps.map((stamp, index) => {
    const next = stamps[index + 1] ?? end;
    return Math.max(0, Math.floor((next - stamp) / thinkingMs));
  });
}

/**
 * Milliseconds left of the thinking time running at `now`, the one started at Starta, the last
 * counted guess or the last timeout. Undefined for a game with no thinking time, not started, or
 * over.
 */
export function thinkingTimeLeft(game: Game, now: number): number | undefined {
  const marks = thinkingTimeMarks(game);
  if (marks === undefined || game.endedAt !== undefined) return undefined;
  const elapsed = Math.max(0, now - marks.last);
  return marks.thinkingMs - (elapsed % marks.thinkingMs);
}

function thinkingTimeMarks(game: Game) {
  const seconds = game.rules.thinkingTime;
  if (seconds === undefined || game.startedAt === undefined) return undefined;
  const stamps = [game.startedAt, ...(game.guessedAt ?? [])];
  return { stamps, last: stamps[stamps.length - 1] as number, thinkingMs: seconds * 1000 };
}
