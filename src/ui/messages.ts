import type { GameReview, GuessResult } from "../engine/game";

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

/** The result view's outcome: `+2`, `Perfekt` or `3 kvar`, under a short headline. */
export function resultOutcome(
  review: Pick<GameReview, "status" | "extra" | "perfect" | "away">,
): { headline: string; score: string } | undefined {
  if (review.status === "won") {
    return { headline: "Framme!", score: review.perfect ? "Perfekt" : `+${review.extra}` };
  }
  if (review.status === "lost") {
    return { headline: "Slut på gissningar", score: `${review.away} kvar` };
  }
  return undefined;
}
