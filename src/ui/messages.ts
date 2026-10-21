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

export function outcomeMessage(
  review: Pick<GameReview, "status" | "extra" | "perfect" | "away">,
  missingNames: readonly string[],
): string | undefined {
  if (review.status === "won") {
    return review.perfect ? "Framme! Perfekt" : `Framme! +${review.extra}`;
  }
  if (review.status === "lost") {
    return `Slut på gissningar. ${review.away} kvar: ${missingNames.join(", ")}`;
  }
  return undefined;
}
