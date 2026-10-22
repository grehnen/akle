import {
  compareLinks,
  type Kommun,
  type KommunCode,
  type NeighborLink,
} from "../../src/graph/graphVersion";
import { qualifies, type FixedLink, type WayFailure } from "./fixedLinks";
import { compareCodes, type Pair, pairKey, sortedPair } from "../../src/graph/kommunPair";
import { pairFlagKinds, type NeighborOverrides, type PairFlagKind } from "./neighborOverrides";

/** A WGS 84 `[lon, lat]` point. */
export type Point = readonly [number, number];

/** What the graph build found, before any override: the committed inputs of the review. */
export type BuildEvidence = {
  /** SCB's current kommun list. */
  kommuner: readonly Kommun[];
  /** The codes that have an OSM boundary and a drawn shape. */
  shapeCodes: readonly KommunCode[];
  /**
   * Every border two OSM boundaries share, with its length on land (0 when all water), how that
   * splits between the mainland and islands, its length in river water, and the kommuner whose
   * exclaves hold all of its land.
   */
  landBorders: readonly {
    between: Pair;
    landLength: number;
    mainlandLength: number;
    islandLength: number;
    riverLength: number;
    exclaveOf: readonly KommunCode[];
    at: Point;
  }[];
  /**
   * Pairs whose OSM boundaries meet only at single points, one of them on meaningful land: the
   * mainland or an island of 1 km² or more.
   */
  pointTouches: readonly { between: Pair; at: Point }[];
  fixedLinks: readonly FixedLink[];
};

/** A pair the build can't trust on its own, with what it measured. */
export type FlaggedPair = {
  between: Pair;
  kinds: PairFlagKind[];
  /** Length of the shared OSM border on land, in m, when there is one. */
  landLength?: number;
  /** How the land border splits between the mainland and islands, when some is on islands. */
  mainlandLength?: number;
  islandLength?: number;
  /** Length of the shared OSM border in river water, in m, when some is. */
  riverLength?: number;
  /** The kommuner whose exclaves hold the whole land border, when any does. */
  exclaveOf?: KommunCode[];
  /** OSM way ids of the detected fixed link. */
  ways?: number[];
  /** The ways that keep the fixed link from qualifying, so it isn't in the graph. */
  failures?: WayFailure[];
  /** Where to look on the map. */
  at: Point;
  /**
   * The links the build generated for the pair, before any verdict; empty when it isn't a neighbor,
   * as when its land border is dropped for being on small islands or an exclave.
   */
  built: ("land" | "fixed")[];
  /** The human verdict from `neighbor-overrides.yaml`, if there is one. */
  verdict?: Verdict;
};

export type Verdict =
  | { action: "keep"; reason: string }
  | { action: "add" | "remove"; reason: string; evidence: string };

export type NeighborReview = {
  /**
   * The shipped neighbor graph: the generated links plus ferries, with overrides applied. The
   * generated links leave out island and river borders under 1000 m and land borders only on an
   * exclave, and count a point touch on land as a land border.
   */
  links: NeighborLink[];
  flaggedPairs: FlaggedPair[];
  /** Flags without a verdict, new flag kinds on reviewed pairs and stale entries. */
  problems: string[];
  /** Problems across the whole graph, which no verdict can accept. */
  graphProblems: string[];
};

/** Below this land border length (m), a land border may be data noise. */
const shortBorderLength = 100;
/** Below this length (m), a land border only on islands may be a small island's, not a real one. */
const shortIslandBorderLength = 1000;
/** From this length (m), a border only in river water makes its pair land neighbors. */
const longRiverBorderLength = 1000;

export function reviewNeighborGraph(
  evidence: BuildEvidence,
  overrides: NeighborOverrides,
): NeighborReview {
  const borders = byPair(evidence.landBorders);
  const touches = byPair(evidence.pointTouches);
  const fixed = byPair(evidence.fixedLinks);

  const generated: NeighborLink[] = [
    ...evidence.landBorders.filter(makesLandNeighbors).map((border) => ({
      between: sortedPair(border.between),
      kind: "land" as const,
    })),
    ...evidence.pointTouches.map((touch) => ({
      between: sortedPair(touch.between),
      kind: "land" as const,
    })),
    ...evidence.fixedLinks.filter(qualifies).map((link) => ({
      between: sortedPair(link.between),
      kind: "fixed" as const,
    })),
  ];
  const generatedPairs = new Set(generated.map((link) => pairKey(link.between)));

  const flagKinds = new Map<string, Set<PairFlagKind>>();
  const flag = (key: string, kind: PairFlagKind) =>
    flagKinds.set(key, (flagKinds.get(key) ?? new Set()).add(kind));
  // A long island or river border makes neighbors, but needs a look when nothing else does.
  const hasOtherValidLink = (key: string) => {
    const link = fixed.get(key);
    return touches.has(key) || (link !== undefined && qualifies(link));
  };
  for (const [key, border] of borders) {
    if (border.landLength > 0 && border.landLength < shortBorderLength) flag(key, "short-border");
    if (isShortIslandBorder(border) || (isLongIslandBorder(border) && !hasOtherValidLink(key))) {
      flag(key, "island-border");
    }
    if (isExclaveBorder(border)) flag(key, "exclave-border");
    if (isRiverBorder(border) && !(isLongRiverBorder(border) && hasOtherValidLink(key))) {
      flag(key, "river-border");
    }
  }
  for (const key of touches.keys()) flag(key, "point-touch");
  for (const [key, link] of fixed) {
    const border = borders.get(key);
    if (!qualifies(link) && !(border && makesLandNeighbors(border))) {
      flag(key, "non-qualifying-link");
    }
  }

  const flaggedPairs = [...flagKinds]
    .sort(([a], [b]) => compareCodes(a, b))
    .map(([key, kinds]): FlaggedPair => {
      const border = borders.get(key);
      const link = fixed.get(key);
      const at = (border ?? touches.get(key))?.at ?? [0, 0];
      return {
        between: sortedPair(key.split("-")),
        kinds: pairFlagKinds.filter((kind) => kinds.has(kind)),
        ...(border && { landLength: border.landLength }),
        ...(border &&
          border.islandLength > 0 && {
            mainlandLength: border.mainlandLength,
            islandLength: border.islandLength,
          }),
        ...(border && border.riverLength > 0 && { riverLength: border.riverLength }),
        ...(border && border.exclaveOf.length > 0 && { exclaveOf: [...border.exclaveOf] }),
        ...(link && { ways: link.ways }),
        ...(link && link.failures.length > 0 && { failures: link.failures }),
        at,
        built: [
          ...((border && makesLandNeighbors(border)) || touches.has(key) ? ["land" as const] : []),
          ...(link && qualifies(link) ? ["fixed" as const] : []),
        ],
      };
    });

  const names = new Map(evidence.kommuner.map((kommun) => [kommun.code, kommun.name]));
  const describe = (key: string) =>
    `${key} (${key
      .split("-")
      .map((code) => names.get(code) ?? code)
      .join("–")})`;
  const pairProblems: [string, string][] = [];
  const problem = (key: string, message: string) =>
    pairProblems.push([key, `${describe(key)}${message}`]);

  const verdicts = new Map<string, Verdict>();
  const ferryPairs = new Set(overrides.ferries.map((link) => pairKey(link.between)));
  for (const { between, kinds, reason } of overrides.reviewed) {
    const key = pairKey(between);
    verdicts.set(key, { action: "keep", reason });
    const flagged = flagKinds.get(key);
    if (flagged === undefined) {
      problem(key, ": stale keep, the pair is no longer flagged; delete the entry");
      continue;
    }
    const gone = kinds.filter((kind) => !flagged.has(kind));
    if (gone.length > 0) {
      problem(key, `: stale keep, the pair is no longer flagged ${gone.join(", ")}; drop the kind`);
    }
    const added = pairFlagKinds.filter((kind) => flagged.has(kind) && !kinds.includes(kind));
    if (added.length > 0) {
      problem(key, ` is now also flagged ${added.join(", ")}, which its keep doesn't cover`);
    }
  }
  let links = [...generated, ...overrides.ferries.map((link) => ({ ...link }))];
  for (const { between, action, link, reason, evidence: source } of overrides.overrides) {
    const key = pairKey(between);
    verdicts.set(key, { action, reason, evidence: source });
    if (action === "remove") {
      if (!generatedPairs.has(key)) {
        problem(key, ": stale remove, the graph doesn't contain the pair; delete the entry");
      }
      links = links.filter((other) => pairKey(other.between) !== key);
    } else {
      if (generatedPairs.has(key) || ferryPairs.has(key)) {
        problem(key, ": stale add, the graph already finds the pair; delete the entry");
      }
      links.push({ between: sortedPair(between), kind: link ?? "land" });
    }
  }
  for (const flagged of flaggedPairs) {
    const verdict = verdicts.get(pairKey(flagged.between));
    if (verdict) flagged.verdict = verdict;
    else {
      const key = pairKey(flagged.between);
      problem(key, ` is flagged ${flagged.kinds.join(", ")} but has no verdict`);
    }
  }

  const shipped = links
    .map((link) => ({ between: sortedPair(link.between), kind: link.kind }))
    .sort(compareLinks);
  return {
    links: shipped,
    flaggedPairs,
    graphProblems: wholeGraphProblems(evidence, shipped),
    problems: pairProblems.sort(([a], [b]) => compareCodes(a, b)).map(([, message]) => message),
  };
}

type LandBorderEvidence = BuildEvidence["landBorders"][number];

function isShortIslandBorder(border: LandBorderEvidence): boolean {
  return (
    border.landLength > 0 &&
    border.mainlandLength === 0 &&
    border.islandLength < shortIslandBorderLength
  );
}

function isLongIslandBorder(border: LandBorderEvidence): boolean {
  return (
    border.landLength > 0 &&
    border.mainlandLength === 0 &&
    border.islandLength >= shortIslandBorderLength
  );
}

function isExclaveBorder(border: LandBorderEvidence): boolean {
  return border.landLength > 0 && border.exclaveOf.length > 0;
}

/**
 * Whether a land border makes its pair neighbors: any length on land, unless it lies only on
 * islands and is under 1000 m, or only on an exclave. Such a pair stays a neighbor only through a
 * qualifying fixed link or an `add` override.
 */
function countsAsLandBorder(border: LandBorderEvidence): boolean {
  return border.landLength > 0 && !isShortIslandBorder(border) && !isExclaveBorder(border);
}

/** A border with no land, only river water: the river may separate the pair or not. */
function isRiverBorder(border: LandBorderEvidence): boolean {
  return border.landLength === 0 && border.riverLength > 0;
}

function isLongRiverBorder(border: LandBorderEvidence): boolean {
  return isRiverBorder(border) && border.riverLength >= longRiverBorderLength;
}

function makesLandNeighbors(border: LandBorderEvidence): boolean {
  return countsAsLandBorder(border) || isLongRiverBorder(border);
}

function wholeGraphProblems(evidence: BuildEvidence, links: readonly NeighborLink[]): string[] {
  const names = new Map(evidence.kommuner.map((kommun) => [kommun.code, kommun.name]));
  const named = (code: KommunCode) => `${names.get(code)} (${code})`;
  const neighbors = new Map<KommunCode, KommunCode[]>(
    evidence.kommuner.map((kommun) => [kommun.code, []]),
  );
  for (const { between } of links) {
    neighbors.get(between[0])?.push(between[1]);
    neighbors.get(between[1])?.push(between[0]);
  }
  const problems: string[] = [];
  const isolated = [...neighbors].filter(([, list]) => list.length === 0).map(([code]) => code);
  for (const code of isolated) problems.push(`${named(code)} has no neighbors`);

  const components: KommunCode[][] = [];
  const seen = new Set<KommunCode>(isolated);
  for (const start of neighbors.keys()) {
    if (seen.has(start)) continue;
    const component = [start];
    seen.add(start);
    for (let index = 0; index < component.length; index++) {
      for (const next of neighbors.get(component[index]) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          component.push(next);
        }
      }
    }
    components.push(component);
  }
  const main = components.reduce<KommunCode[]>(
    (largest, component) => (component.length > largest.length ? component : largest),
    [],
  );
  const unreachable = components
    .filter((component) => component !== main)
    .flat()
    .sort(compareCodes);
  if (unreachable.length > 0) {
    problems.push(
      `${unreachable.map(named).join(", ")} can't be reached from the rest of the graph`,
    );
  }

  const shapeCodes = new Set(evidence.shapeCodes);
  for (const { code } of evidence.kommuner) {
    if (!shapeCodes.has(code))
      problems.push(`${named(code)} is in SCB's list but has no OSM boundary`);
  }
  const used = new Set([
    ...evidence.shapeCodes,
    ...[
      ...evidence.landBorders,
      ...evidence.pointTouches,
      ...evidence.fixedLinks,
      ...links,
    ].flatMap((item) => item.between),
  ]);
  for (const code of [...used].sort(compareCodes)) {
    if (!names.has(code)) problems.push(`${code} has an OSM boundary but isn't in SCB's list`);
  }
  return problems;
}

function byPair<Item extends { between: readonly KommunCode[] }>(
  items: readonly Item[],
): Map<string, Item> {
  return new Map(items.map((item) => [pairKey(item.between), item]));
}
