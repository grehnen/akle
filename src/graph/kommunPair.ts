import type { KommunCode } from "./graphVersion";

/** Two kommuner, in code order. */
export type Pair = readonly [KommunCode, KommunCode];

/** An unordered pair of kommuner, as "a-b" with a < b. */
export type PairKey = string;

/** Orders SCB codes by plain string comparison, not by locale. */
export function compareCodes(a: KommunCode, b: KommunCode): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortedPair(between: readonly KommunCode[]): [KommunCode, KommunCode] {
  const [a, b] = between;
  return compareCodes(a, b) <= 0 ? [a, b] : [b, a];
}

export function pairKey(between: readonly KommunCode[]): PairKey {
  return sortedPair(between).join("-");
}

export function pairEndpoints(key: PairKey): [KommunCode, KommunCode] {
  return key.split("-") as [KommunCode, KommunCode];
}
