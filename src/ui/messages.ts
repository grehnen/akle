import type { GameReview, GuessResult } from "../engine/game";
import { hintCount } from "../progress/shareText";

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
  if (review.status === "won") {
    const hints = review.hintsUsed ? ` (${hintCount(review.hintsUsed)})` : "";
    return { headline: "Framme!", score: review.perfect ? "Perfekt" : `+${review.extra}${hints}` };
  }
  if (review.status === "lost") {
    return { headline: "Slut på gissningar", score: `${review.away} kvar` };
  }
  return undefined;
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
