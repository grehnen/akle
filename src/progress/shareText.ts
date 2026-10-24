import { SITE_URL } from "../siteUrl";
import { hintsNote } from "../ui/messages";
import type { Outcome } from "./outcome";

/** A finished game as the share text needs it. */
export type ShareResult = {
  tripNumber: number;
  outcome: Outcome;
  /** One ✅/🟩/🟧/🟥 per counted guess, in guess order. */
  emojiLine: string;
};

/** The three lines a player copies: `#åkle #n` and the result, the emoji line, the site. */
export function shareText(result: ShareResult): string {
  return [
    `#åkle #${result.tripNumber} ${resultLabel(result.outcome)}`,
    result.emojiLine,
    SITE_URL,
  ].join("\n");
}

/**
 * How a game went in share text: `+2`, `+0 (Perfekt)`, `+1 (1 ledtråd)`, `(3 ifrån)` or, for a
 * free-play give-up, `Gav upp (3 ifrån)`.
 */
export function resultLabel(outcome: Outcome): string {
  switch (outcome.kind) {
    case "perfect":
      return `+${outcome.extra} (Perfekt)`;
    case "won":
      return `+${outcome.extra}${hintsNote(outcome.hintsUsed)}`;
    case "lost":
      return `${outcome.givenUp ? "Gav upp " : ""}(${outcome.away} ifrån)${hintsNote(outcome.hintsUsed)}`;
  }
}
