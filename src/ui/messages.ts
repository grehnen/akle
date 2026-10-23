import type { Feedback, GameReview, GameStatus, GuessCard, GuessResult } from "../engine/game";
import type { HINT_COUNT } from "../engine/hints";
import { gameOutcome } from "../progress/outcome";

type RejectionReason = Extract<GuessResult, { kind: "rejected" }>["reason"];

export function rejectionMessage(reason: RejectionReason, input: string): string {
  switch (reason) {
    case "unknown":
      return `Okänd kommun: ${input}`;
    case "repeat":
      return `Redan gissad: ${input}`;
    case "endpoint":
      return `Det är start-/målkommunen: ${input}`;
    case "game-over":
      return "Spelet är slut";
  }
}

/** The result view's outcome: `Framme! (+2)`, `Framme! (+1, 1 ledtråd)`, `Perfekt!` or `Slut på gissningar (3 ifrån)`. */
export function resultOutcome(
  review: Pick<GameReview, "status" | "extra" | "perfect" | "away"> &
    Partial<Pick<GameReview, "hintsUsed">>,
): string | undefined {
  const outcome = gameOutcome(review);
  switch (outcome?.kind) {
    case undefined:
      return undefined;
    case "perfect":
      return "Perfekt!";
    case "won":
      return `Framme! (+${outcome.extra}${hintsSuffix(outcome.hintsUsed)})`;
    case "lost":
      return `Slut på gissningar (${outcome.away} ifrån${hintsSuffix(outcome.hintsUsed)})`;
  }
}

function hintsSuffix(hintsUsed: number): string {
  return hintsUsed > 0 ? `, ${hintCount(hintsUsed)}` : "";
}

/** ` (2 ledtrådar)` after a result when hints were used, else nothing. */
export function hintsNote(hintsUsed: number): string {
  return hintsUsed > 0 ? ` (${hintCount(hintsUsed)})` : "";
}

/** `1 ledtråd`, `2 ledtrådar`. */
function hintCount(hints: number): string {
  return hints === 1 ? "1 ledtråd" : `${hints} ledtrådar`;
}

/** The hint buttons, in the order they're taken: what each hint reveals. */
export const HINT_LABELS = [
  "Visa nästa kommun",
  "Visa alla kommuner",
  "Visa initialer",
] as const satisfies readonly string[] & {
  length: typeof HINT_COUNT;
};

const FEEDBACK_TEXTS: Record<Feedback, string> = {
  "✅": "på kortaste vägen och ansluten",
  "🟩": "på en kortaste väg",
  "🟧": "nära en kortaste väg",
  "🟥": "långt från en kortaste väg",
};

/** A feedback square in words, for screen readers. */
export function feedbackText(feedback: Feedback): string {
  return FEEDBACK_TEXTS[feedback];
}

/**
 * What the live region says after a guess: `Gissning 2 av 7: Trosa, på en kortaste väg.`, then
 * the end of the game if it ended. ✅ already says the guess is connected.
 */
export function guessAnnouncement(
  card: GuessCard,
  {
    number,
    limit,
    name,
    status,
  }: { number: number; limit: number; name: string; status: GameStatus },
): string {
  const connected = card.connected ? connectionText(card) : "";
  const ending =
    status === "won" ? " Du nådde målet!" : status === "lost" ? " Slut på gissningar." : "";
  return `Gissning ${number} av ${limit}: ${name}, ${feedbackText(card.feedback)}${connected}.${ending}`;
}

/** What the live region says after hint `taken` (1 to 3). */
export function hintAnnouncement(taken: number): string {
  switch (taken) {
    case 1:
      return "Ledtråd 1: nästa kommun på en kortaste väg visas som kontur på kartan.";
    case 2:
      return "Ledtråd 2: alla kommuner visas som konturer på kartan.";
    default:
      return `Ledtråd ${taken}: kommunernas initialer visas när du pekar på konturerna.`;
  }
}

/** A guess card in words: `Gissning 2: Trosa, på en kortaste väg, inte ansluten till start.` */
export function guessCardText(
  card: GuessCard,
  { number, name }: { number: number; name: string },
): string {
  return `Gissning ${number}: ${name}, ${feedbackText(card.feedback)}${connectionText(card)}.`;
}

/** Whether a guess off the route is connected to the start; a ✅ guess always is, so it says nothing. */
function connectionText(card: GuessCard): string {
  if (card.feedback === "✅") return "";
  return card.connected ? ", ansluten till start" : ", inte ansluten till start";
}
