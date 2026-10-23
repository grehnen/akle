import { type GraphVersion, type KommunCode, lanOf } from "../graph/graphVersion";
import { type PairKey, pairKey } from "../graph/kommunPair";
import { shortestRouteLengthsFrom } from "../graph/routes";
import { type Cooldown, cooldownDaysOn, lanCooldownDaysOn, type ScheduledPuzzle } from "./schedule";

export const minimumN = 3;
export const maximumN = 8;

const pairGroupCache = new WeakMap<GraphVersion, ReadonlyMap<number, readonly PairKey[]>>();

/** Every pair with N in 3–8 in a graph version, grouped by N and sorted by pair key. */
export function pairsByN(graph: GraphVersion): ReadonlyMap<number, readonly PairKey[]> {
  const cached = pairGroupCache.get(graph);
  if (cached) return cached;
  const groups = new Map<number, PairKey[]>();
  for (let n = minimumN; n <= maximumN; n++) groups.set(n, []);
  for (const from of graph.kommuner.keys()) {
    for (const [to, n] of shortestRouteLengthsFrom(graph, from)) {
      if (from < to && n >= minimumN && n <= maximumN) groups.get(n)?.push(pairKey([from, to]));
    }
  }
  for (const pairs of groups.values()) pairs.sort();
  pairGroupCache.set(graph, groups);
  return groups;
}

/**
 * The schedule so far, in puzzle order: how often each pair has been used and which
 * kommuner were recent endpoints. The rules check and the generator share it, so a
 * generated row always passes the check.
 */
export class ScheduleHistory {
  private readonly pairUses = new Map<PairKey, number>();
  private readonly endpointsByPuzzle = new Map<number, readonly KommunCode[]>();

  constructor(private readonly cooldown: Cooldown) {}

  add(row: ScheduledPuzzle): void {
    const key = pairKey([row.start, row.destination]);
    this.pairUses.set(key, this.uses(key) + 1);
    this.endpointsByPuzzle.set(row.number, [row.start, row.destination]);
  }

  uses(key: PairKey): number {
    return this.pairUses.get(key) ?? 0;
  }

  /** The pairs in a group that are used least so far; only these may come next. */
  leastUsed(pairs: readonly PairKey[]): PairKey[] {
    const fewestUses = Math.min(...pairs.map((key) => this.uses(key)));
    return pairs.filter((key) => this.uses(key) === fewestUses);
  }

  /** The kommun was an endpoint within the cooldown of `graph` before this puzzle number. */
  inCooldown(code: KommunCode, puzzleNumber: number, graph: GraphVersion): boolean {
    return this.endpointWithin(
      cooldownDaysOn(this.cooldown, graph.id),
      puzzleNumber,
      (earlier) => earlier === code,
    );
  }

  /** A kommun in the same län was an endpoint within the län cooldown of `graph`. */
  inLanCooldown(code: KommunCode, puzzleNumber: number, graph: GraphVersion): boolean {
    const lan = lanOf(code);
    return this.endpointWithin(
      lanCooldownDaysOn(this.cooldown, graph.id),
      puzzleNumber,
      (earlier) => lanOf(earlier) === lan,
    );
  }

  /** The kommun may be an endpoint of this puzzle under both cooldowns. */
  isAvailable(code: KommunCode, puzzleNumber: number, graph: GraphVersion): boolean {
    return (
      !this.inCooldown(code, puzzleNumber, graph) && !this.inLanCooldown(code, puzzleNumber, graph)
    );
  }

  private endpointWithin(
    days: number,
    puzzleNumber: number,
    matches: (earlier: KommunCode) => boolean,
  ): boolean {
    for (let earlier = puzzleNumber - days; earlier < puzzleNumber; earlier++) {
      if (this.endpointsByPuzzle.get(earlier)?.some(matches)) return true;
    }
    return false;
  }

  /** Why `row` can't come next on `graph`, or an empty list when it can. */
  violations(row: ScheduledPuzzle, graph: GraphVersion): string[] {
    const where = `Puzzle #${row.number}`;
    const missing = [row.start, row.destination].filter((code) => !graph.kommuner.has(code));
    if (missing.length > 0) {
      return missing.map(
        (code) => `${where}: ${code} is not a kommun in graph version ${graph.id}`,
      );
    }
    const n =
      row.start === row.destination
        ? 0
        : (shortestRouteLengthsFrom(graph, row.start).get(row.destination) ?? Infinity);
    if (n !== row.n) {
      return [`${where}: N is ${row.n} but graph version ${graph.id} gives ${n}`];
    }
    if (n < minimumN || n > maximumN) {
      return [`${where}: N is ${n}, outside ${minimumN}–${maximumN}`];
    }
    const problems: string[] = [];
    const key = pairKey([row.start, row.destination]);
    const group = pairsByN(graph).get(n) ?? [];
    if (!this.leastUsed(group).includes(key)) {
      problems.push(
        `${where}: ${key} repeats (used ${this.uses(key)} times) before every N ${n} pair is used as often`,
      );
    }
    for (const code of [row.start, row.destination]) {
      if (this.inCooldown(code, row.number, graph)) {
        problems.push(
          `${where}: ${code} was an endpoint within the last ${cooldownDaysOn(this.cooldown, graph.id)} puzzles`,
        );
      } else if (this.inLanCooldown(code, row.number, graph)) {
        problems.push(
          `${where}: ${code}'s län ${lanOf(code)} had an endpoint within the last ${lanCooldownDaysOn(this.cooldown, graph.id)} puzzles`,
        );
      }
    }
    return problems;
  }
}
