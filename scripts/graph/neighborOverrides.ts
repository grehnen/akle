import type { Kommun, KommunCode, NeighborLink } from "../../src/graph/graphVersion";
import { type Pair, pairKey, sortedPair } from "../../src/graph/kommunPair";

/** The kinds of flag a pair can get, each needing a human verdict (ADR 0003). */
export const pairFlagKinds = [
  "short-border",
  "point-touch",
  "non-qualifying-link",
  "island-border",
  "exclave-border",
  "river-border",
] as const;
export type PairFlagKind = (typeof pairFlagKinds)[number];

/** An `add` or `remove` correction to the generated graph, backed by a reason and evidence. */
export type NeighborOverride = {
  between: Pair;
  action: "add" | "remove";
  /** How an added pair is linked. */
  link?: "land" | "fixed";
  reason: string;
  evidence: string;
};

/** A `keep` verdict: the generated graph is right about this pair despite its flags. */
export type ReviewedPair = { between: Pair; kinds: PairFlagKind[]; reason: string };

export type NeighborOverrides = {
  ferries: NeighborLink[];
  overrides: NeighborOverride[];
  reviewed: ReviewedPair[];
};

type Entry = Record<string, unknown>;

/**
 * Reads `data/neighbor-overrides.yaml` (ADR 0003): the hand-kept `ferries`, the `overrides`
 * and the `reviewed` keep verdicts. Every entry is keyed by an unordered pair of SCB codes;
 * the names are for readers and must match the codes. A pair may appear only once.
 */
export function readNeighborOverrides(
  yaml: string,
  kommuner: readonly Kommun[],
): NeighborOverrides {
  const names = new Map(kommuner.map((kommun) => [kommun.code, kommun.name]));
  const document = (Bun.YAML.parse(yaml) ?? {}) as Record<string, unknown>;
  const listed = new Map<string, string>();

  const entries = (section: string): { entry: Entry; where: string }[] => {
    const list = document[section] ?? [];
    if (!Array.isArray(list)) throw new Error(`${section} must be a list`);
    return list.map((entry: unknown, index) => {
      const where = `${section}[${index}]`;
      if (typeof entry !== "object" || entry === null) throw new Error(`${where}: not an entry`);
      return { entry: entry as Entry, where };
    });
  };

  const readPair = (entry: Entry, where: string, key: string): [KommunCode, KommunCode] => {
    const between = entry[key];
    if (!isPair(between)) throw new Error(`${where}: ${key} needs two SCB codes`);
    if (!isPair(entry.names)) throw new Error(`${where}: names needs two kommun names`);
    between.forEach((code, side) => {
      const name = names.get(code);
      if (name === undefined) throw new Error(`${where}: unknown kommun code ${code}`);
      const listedName = (entry.names as string[])[side];
      if (listedName !== name) throw new Error(`${where}: ${code} is ${name}, not ${listedName}`);
    });
    if (typeof entry.reason !== "string" || entry.reason.trim() === "") {
      throw new Error(`${where}: needs a reason`);
    }
    const listedPair = pairKey(between);
    const earlier = listed.get(listedPair);
    if (earlier !== undefined)
      throw new Error(`${where}: ${listedPair} is already listed in ${earlier}`);
    listed.set(listedPair, where);
    return between;
  };

  const ferries = entries("ferries").map(({ entry, where }): NeighborLink => {
    const between = readPair(entry, where, "between");
    return { between: [between[0], between[1]], kind: "ferry" };
  });

  const overrides = entries("overrides").map(({ entry, where }): NeighborOverride => {
    const action = "add" in entry ? "add" : "remove" in entry ? "remove" : undefined;
    if (action === undefined || ("add" in entry && "remove" in entry)) {
      throw new Error(`${where}: needs either add or remove`);
    }
    const between = sortedPair(readPair(entry, where, action));
    if (typeof entry.evidence !== "string" || !/^https?:\/\/\S+$/.test(entry.evidence)) {
      throw new Error(`${where}: needs an evidence link`);
    }
    const override: NeighborOverride = {
      between,
      action,
      reason: entry.reason as string,
      evidence: entry.evidence,
    };
    if (action === "add") {
      if (entry.link !== "land" && entry.link !== "fixed") {
        throw new Error(`${where}: link must be land or fixed`);
      }
      override.link = entry.link;
    }
    return override;
  });

  const reviewed = entries("reviewed").map(({ entry, where }): ReviewedPair => {
    const between = sortedPair(readPair(entry, where, "keep"));
    const kinds = entry.kinds;
    if (
      !Array.isArray(kinds) ||
      kinds.length === 0 ||
      !kinds.every((kind) => pairFlagKinds.includes(kind)) ||
      new Set(kinds).size !== kinds.length
    ) {
      throw new Error(
        `${where}: kinds must list flag kinds from ${pairFlagKinds.join(", ")}, each once`,
      );
    }
    return { between, kinds: kinds as PairFlagKind[], reason: entry.reason as string };
  });

  return { ferries, overrides, reviewed };
}

function isPair(value: unknown): value is [KommunCode, KommunCode] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((item) => typeof item === "string" && item !== "")
  );
}
