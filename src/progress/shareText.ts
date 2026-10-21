import type { HistoryEntry } from "./history";

export const SITE_URL = "https://akle.grehn.net";

/** A finished game as the share text needs it. */
export type ShareResult = Pick<
  HistoryEntry,
  "won" | "extra" | "perfect" | "hintsUsed" | "emojiLine"
> & {
  puzzleNumber: number;
  /** Kommuner still missing on a loss: the "k kvar". */
  away: number;
};

/** The three lines a player copies: `#åkle #n` and the result, the emoji line, the site. */
export function shareText(result: ShareResult): string {
  return [`#åkle #${result.puzzleNumber} ${resultLabel(result)}`, result.emojiLine, SITE_URL].join(
    "\n",
  );
}

function resultLabel(result: ShareResult): string {
  if (!result.won) return `(${result.away} kvar)`;
  // Hints will take the place of "(Perfekt)" here, as `(n ledtrådar)`.
  return result.perfect ? `+${result.extra} (Perfekt)` : `+${result.extra}`;
}
