import type { HistoryEntry } from "./history";
import { classifyOutcome, hintsNote } from "./outcome";

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
  const outcome = classifyOutcome(result);
  switch (outcome.kind) {
    case "perfect":
      return `+${outcome.extra} (Perfekt)`;
    case "won":
      return `+${outcome.extra}${hintsNote(outcome.hintsUsed)}`;
    case "lost":
      return `(${result.away} kvar)${hintsNote(outcome.hintsUsed)}`;
  }
}
