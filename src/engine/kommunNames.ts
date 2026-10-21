import type { GraphVersion, KommunCode } from "../graph/graphVersion";

/** Lower-cases and drops whitespace and hyphens, so "Upplands Bro" matches "Upplands-Bro". */
export function normalizeKommunName(name: string): string {
  return name.toLocaleLowerCase("sv").replace(/[\s\-‐‑–—]+/g, "");
}

/** Like `normalizeKommunName`, but also strips accents, so "Orebro" matches "Örebro". */
export function foldKommunName(name: string): string {
  return normalizeKommunName(name)
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "");
}

/**
 * The kommun an exactly typed name refers to, ignoring case, spacing, hyphens and accents.
 * A literal match beats an accent-folded one (`habo` is Habo, `håbo` is Håbo).
 */
export function resolveKommunName(graph: GraphVersion, input: string): KommunCode | undefined {
  const normalized = normalizeKommunName(input);
  if (normalized === "") return undefined;
  const folded = foldKommunName(input);

  let foldedMatch: KommunCode | undefined;
  for (const kommun of graph.kommuner.values()) {
    if (normalizeKommunName(kommun.name) === normalized) return kommun.code;
    if (foldedMatch === undefined && foldKommunName(kommun.name) === folded) {
      foldedMatch = kommun.code;
    }
  }
  return foldedMatch;
}
