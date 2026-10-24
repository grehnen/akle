import { type GraphVersion, type KommunCode, lanOf } from "../graph/graphVersion";
import { type PairKey, pairEndpoints, pairKey } from "../graph/kommunPair";
import { shortestRouteLengthsFrom } from "../graph/routes";
import { type Cooldown, cooldownDaysOn, lanCooldownDaysOn, type ScheduledTrip } from "./schedule";

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
 * The schedule so far, in trip order: how often each pair has been used and which
 * kommuner were recent endpoints. The rules check and the generator share it, so a
 * generated row always passes the check.
 */
export class ScheduleHistory {
  private readonly pairUses = new Map<PairKey, number>();
  private readonly endpointsByTrip = new Map<number, readonly KommunCode[]>();

  constructor(private readonly cooldown: Cooldown) {}

  add(row: ScheduledTrip): void {
    const key = pairKey([row.start, row.destination]);
    this.pairUses.set(key, this.uses(key) + 1);
    this.endpointsByTrip.set(row.number, [row.start, row.destination]);
  }

  uses(key: PairKey): number {
    return this.pairUses.get(key) ?? 0;
  }

  /**
   * The pairs in a group that may come next: of those whose endpoints are outside both
   * cooldowns, the ones used least so far. So a pair repeats before a less-used one only
   * while every less-used one is in cooldown.
   */
  candidates(pairs: readonly PairKey[], tripNumber: number, graph: GraphVersion): PairKey[] {
    const blockedKommuner = new Set(
      this.endpointsWithin(cooldownDaysOn(this.cooldown, graph.id), tripNumber),
    );
    const blockedLan = new Set(
      this.endpointsWithin(lanCooldownDaysOn(this.cooldown, graph.id), tripNumber).map(lanOf),
    );
    const available = pairs.filter((key) =>
      pairEndpoints(key).every(
        (code) => !blockedKommuner.has(code) && !blockedLan.has(lanOf(code)),
      ),
    );
    const fewestUses = Math.min(...available.map((key) => this.uses(key)));
    return available.filter((key) => this.uses(key) === fewestUses);
  }

  /** The kommun was an endpoint within the cooldown of `graph` before this trip number. */
  inCooldown(code: KommunCode, tripNumber: number, graph: GraphVersion): boolean {
    return this.endpointsWithin(cooldownDaysOn(this.cooldown, graph.id), tripNumber).includes(code);
  }

  /** A kommun in the same län was an endpoint within the län cooldown of `graph`. */
  inLanCooldown(code: KommunCode, tripNumber: number, graph: GraphVersion): boolean {
    const lan = lanOf(code);
    return this.endpointsWithin(lanCooldownDaysOn(this.cooldown, graph.id), tripNumber).some(
      (earlier) => lanOf(earlier) === lan,
    );
  }

  /** The endpoints of the `days` trips before this trip number. */
  private endpointsWithin(days: number, tripNumber: number): KommunCode[] {
    const endpoints: KommunCode[] = [];
    for (let earlier = Math.max(1, tripNumber - days); earlier < tripNumber; earlier++) {
      endpoints.push(...(this.endpointsByTrip.get(earlier) ?? []));
    }
    return endpoints;
  }

  /** Why `row` can't come next on `graph`, or an empty list when it can. */
  violations(row: ScheduledTrip, graph: GraphVersion): string[] {
    const where = `Trip #${row.number}`;
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
    const cooldownProblems: string[] = [];
    for (const code of [row.start, row.destination]) {
      if (this.inCooldown(code, row.number, graph)) {
        cooldownProblems.push(
          `${where}: ${code} was an endpoint within the last ${cooldownDaysOn(this.cooldown, graph.id)} trips`,
        );
      } else if (this.inLanCooldown(code, row.number, graph)) {
        cooldownProblems.push(
          `${where}: ${code}'s län ${lanOf(code)} had an endpoint within the last ${lanCooldownDaysOn(this.cooldown, graph.id)} trips`,
        );
      }
    }
    if (cooldownProblems.length > 0) return cooldownProblems;
    const key = pairKey([row.start, row.destination]);
    const group = pairsByN(graph).get(n) ?? [];
    if (!this.candidates(group, row.number, graph).includes(key)) {
      return [
        `${where}: ${key} repeats (used ${this.uses(key)} times) before every N ${n} pair outside the cooldowns is used as often`,
      ];
    }
    return [];
  }
}
