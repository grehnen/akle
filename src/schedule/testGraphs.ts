import { buildGraphVersion, type GraphVersion } from "../graph/graphVersion";

/** Kommun code for position `index` on a test path: "k00", "k01", … */
export const pathCode = (index: number) => `k${String(index).padStart(2, "0")}`;

/**
 * A graph version whose kommuner form one line, k00 – k01 – … , so the N of a pair is
 * the distance between their positions minus one.
 */
export function pathGraph(length: number, id = "path", startsAtPuzzle = 1): GraphVersion {
  const codes = Array.from({ length }, (_, index) => pathCode(index));
  return buildGraphVersion({
    id,
    startsAtPuzzle,
    kommuner: codes.map((code) => ({ code, name: `Kommun ${code}` })),
    links: codes.slice(1).map((code, index) => ({ between: [codes[index], code], kind: "land" })),
  });
}
