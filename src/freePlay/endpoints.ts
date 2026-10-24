import type { Trip } from "../engine/game";
import { resolveKommunName } from "../engine/kommunNames";
import type { GraphVersion, KommunCode } from "../graph/graphVersion";
import { shortestRouteLength } from "../graph/routes";
import { rankKommuner, type Suggestion, type SuggestionTag } from "../ui/guessSession";

/** The kommun a Start or Mål field names: by name, resolved like a guess, or by its SCB code. */
export function resolveEndpoint(graph: GraphVersion, input: string): KommunCode | undefined {
  const code = input.trim();
  if (graph.kommuner.has(code)) return code;
  return resolveKommunName(graph, input);
}

/**
 * Suggestions for a Start or Mål field. With the other end set, it shows disabled and tagged
 * `samma`, and its neighbors `granne`, since a trip needs at least one kommun between its ends.
 */
export function endpointSuggestions(
  graph: GraphVersion,
  text: string,
  otherEnd?: KommunCode,
): Suggestion[] {
  const tagOf = (code: KommunCode): SuggestionTag | undefined => {
    if (otherEnd === undefined) return undefined;
    if (code === otherEnd) return "samma";
    if (graph.neighbors.get(otherEnd)?.has(code)) return "granne";
    return undefined;
  };
  const byCode = graph.kommuner.get(text.trim());
  if (byCode !== undefined) {
    const disabled = tagOf(byCode.code);
    return [{ code: byCode.code, name: byCode.name, ...(disabled && { disabled }) }];
  }
  return rankKommuner(graph, text, tagOf);
}

/** A picked start and destination, with its distance, once they make a playable trip. */
export function pickedTrip(
  graph: GraphVersion,
  start: KommunCode | undefined,
  destination: KommunCode | undefined,
): { trip: Trip; distance: number } | undefined {
  if (start === undefined || destination === undefined || start === destination) return undefined;
  const distance = shortestRouteLength(graph, start, destination);
  if (distance < 1 || !Number.isFinite(distance)) return undefined;
  return { trip: { start, destination }, distance };
}
