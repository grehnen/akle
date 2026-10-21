import type { Feedback, GameReview, GameStatus, GuessCard, GuessResult } from "../engine/game";
import { classifyOutcome, hintsNote } from "../progress/outcome";

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

/** The result view's outcome: `+2`, `+1 (1 ledtråd)`, `Perfekt` or `3 kvar`, under a short headline. */
export function resultOutcome(
  review: Pick<GameReview, "status" | "extra" | "perfect" | "away"> &
    Partial<Pick<GameReview, "hintsUsed">>,
): { headline: string; score: string } | undefined {
  if (review.status === "playing") return undefined;
  const outcome = classifyOutcome({
    won: review.status === "won",
    extra: review.extra ?? null,
    perfect: review.perfect,
    hintsUsed: review.hintsUsed ?? 0,
  });
  switch (outcome.kind) {
    case "perfect":
      return { headline: "Framme!", score: "Perfekt" };
    case "won":
      return { headline: "Framme!", score: `+${outcome.extra}${hintsNote(outcome.hintsUsed)}` };
    case "lost":
      return { headline: "Slut på gissningar", score: `${review.away} kvar` };
  }
}

/** What the latest hint revealed, under the Ledtråd button. */
export function hintRevealed(hintsUsed: number): string {
  switch (hintsUsed) {
    case 0:
      return "";
    case 1:
      return "Nästa kommun är markerad på kartan.";
    case 2:
      return "Alla kommuner syns nu på kartan.";
    default:
      return "Peka på eller tryck på en kommun för att se dess initialer.";
  }
}

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
