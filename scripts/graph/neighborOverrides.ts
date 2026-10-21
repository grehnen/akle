import type { Kommun, KommunCode, NeighborLink } from "../../src/graph/graphVersion";

type FerryEntry = { between?: unknown; names?: unknown; reason?: unknown };

/**
 * The hand-kept ferry links from `data/neighbor-overrides.yaml` (ADR 0003). Each is keyed by
 * an unordered pair of SCB codes; the names are for readers and must match the codes.
 */
export function readFerries(yaml: string, kommuner: readonly Kommun[]): NeighborLink[] {
  const names = new Map(kommuner.map((kommun) => [kommun.code, kommun.name]));
  const document = Bun.YAML.parse(yaml) as { ferries?: unknown } | null;
  const entries = document?.ferries ?? [];
  if (!Array.isArray(entries)) throw new Error("ferries must be a list");

  const seen = new Set<string>();
  return entries.map((entry: FerryEntry, index) => {
    const where = `ferries[${index}]`;
    const between = entry.between;
    if (!isPair(between)) throw new Error(`${where}: between needs two SCB codes`);
    if (!isPair(entry.names)) throw new Error(`${where}: names needs two kommun names`);
    between.forEach((code, side) => {
      const name = names.get(code);
      if (name === undefined) throw new Error(`${where}: unknown kommun code ${code}`);
      const listed = (entry.names as string[])[side];
      if (listed !== name) throw new Error(`${where}: ${code} is ${name}, not ${listed}`);
    });
    if (typeof entry.reason !== "string" || entry.reason.trim() === "") {
      throw new Error(`${where}: needs a reason`);
    }
    const key = [...between].sort().join("-");
    if (seen.has(key)) throw new Error(`${where}: listed twice: ${key}`);
    seen.add(key);
    return { between: [between[0], between[1]], kind: "ferry" };
  });
}

function isPair(value: unknown): value is [KommunCode, KommunCode] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((item) => typeof item === "string" && item !== "")
  );
}
