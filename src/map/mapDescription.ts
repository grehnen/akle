import type { GuessCard, Puzzle } from "../engine/game";
import { type GraphVersion, type KommunCode, kommunName } from "../graph/graphVersion";

/**
 * The play map in words, for screen readers: the endpoints by colour, the connected guesses, the
 * other guesses and how many hint outlines are drawn, or that every kommun is outlined once the
 * game is finished.
 */
export function mapDescription(
  graph: GraphVersion,
  puzzle: Pick<Puzzle, "start" | "destination">,
  cards: readonly Pick<GuessCard, "code" | "connected">[],
  hintOutlines: readonly KommunCode[] = [],
  { allOutlines = false }: { allOutlines?: boolean } = {},
): string {
  const names = (connected: boolean) =>
    cards
      .filter((card) => card.connected === connected)
      .map((card) => kommunName(graph, card.code))
      .join(", ") || "inga";
  const shown = new Set([puzzle.start, puzzle.destination, ...cards.map((card) => card.code)]);
  const outlines = hintOutlines.filter((code) => !shown.has(code)).length;
  const outlineText = allOutlines
    ? "Alla kommuners konturer visas."
    : outlines === 0
      ? "Inga ledtrådskonturer."
      : `${outlines} ${outlines === 1 ? "ledtrådskontur" : "ledtrådskonturer"}.`;
  return [
    `Start (gul): ${kommunName(graph, puzzle.start)}.`,
    `Mål (blå): ${kommunName(graph, puzzle.destination)}.`,
    `Anslutna gissningar: ${names(true)}.`,
    `Gissningar som inte är anslutna: ${names(false)}.`,
    outlineText,
  ].join(" ");
}
