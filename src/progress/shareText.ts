import { SITE_URL } from "../siteUrl";
import { costsNoteParts, type LabelPart, labelText } from "../ui/messages";
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
 * How a game went in a daily share text: `+2`, `+0 (Perfekt)`, `+1 (1 ledtråd)`, `(3 ifrån)` or
 * `(3 ifrån) (1 ledtråd)`. Timeouts join the hints in brackets: `+1 (1 ledtråd, 2 ⏱)`.
 */
export function resultLabel(outcome: Outcome): string {
  return labelText(resultLabelParts(outcome));
}

/** {@link resultLabel} in parts, its timeouts kept as a count. */
export function resultLabelParts(outcome: Outcome): LabelPart[] {
  switch (outcome.kind) {
    case "perfect":
      return [`+${outcome.extra} (Perfekt)`];
    case "won":
      return [`+${outcome.extra}`, ...costsNoteParts(outcome.hintsUsed, outcome.timeouts)];
    case "lost":
      return [`(${outcome.away} ifrån)`, ...costsNoteParts(outcome.hintsUsed, outcome.timeouts)];
  }
}
