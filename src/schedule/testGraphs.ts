import { buildGraphVersion, type GraphVersion } from "../graph/graphVersion";

/** Kommun code for position `index` on a test path: "k00", "k01", … */
export const pathCode = (index: number) => `k${String(index).padStart(2, "0")}`;

/**
 * A graph version whose kommuner form one line, k00 – k01 – … , so the N of a pair is
 * the distance between their positions minus one.
 */
export function pathGraph(length: number, id = "path", startsAtTrip = 1): GraphVersion {
  return lineGraph(
    Array.from({ length }, (_, index) => pathCode(index)),
    id,
    startsAtTrip,
  );
}

/**
 * Like `pathGraph`, but with SCB-style codes so kommuner fall in län: `perLan` kommuner in
 * län "01", then `perLan` in "02", …, coded "0100", "0101", …, "0200", …
 */
export function lanPathGraph(lanCount: number, perLan: number, id = "lan-path"): GraphVersion {
  const codes = Array.from({ length: lanCount * perLan }, (_, index) =>
    [Math.floor(index / perLan) + 1, index % perLan]
      .map((part) => String(part).padStart(2, "0"))
      .join(""),
  );
  return lineGraph(codes, id, 1);
}

function lineGraph(codes: string[], id: string, startsAtTrip: number): GraphVersion {
  return buildGraphVersion({
    id,
    startsAtTrip,
    kommuner: codes.map((code) => ({ code, name: `Kommun ${code}` })),
    links: codes.slice(1).map((code, index) => ({ between: [codes[index], code], kind: "land" })),
  });
}
