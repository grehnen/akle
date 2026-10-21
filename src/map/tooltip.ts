import { kommunInitials } from "../engine/hints";
import type { GraphVersion } from "../graph/graphVersion";
import type { DrawnKommun } from "./mapFeatures";

/**
 * What a drawn kommun's tooltip says: the endpoints and guesses show their full name, hint
 * outlines `?`, or their initials once hint 3 is taken.
 */
export function tooltipText(
  graph: GraphVersion,
  kommun: Pick<DrawnKommun, "code" | "kind">,
  { initials }: { initials: boolean },
): string | undefined {
  const name = graph.kommuner.get(kommun.code)?.name;
  if (name === undefined) return undefined;
  if (kommun.kind !== "hint") return name;
  return initials ? kommunInitials(name) : "?";
}
