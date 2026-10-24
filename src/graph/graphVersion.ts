import { comparePairs } from "./kommunPair";

/** SCB kommun code, e.g. "0180" for Stockholm. */
export type KommunCode = string;

/** SCB län code, e.g. "01" for Stockholms län. */
export type LanCode = string;

/** The län a kommun lies in: SCB kommun codes begin with their län's two-digit code. */
export function lanOf(code: KommunCode): LanCode {
  return code.slice(0, 2);
}

export type Kommun = {
  code: KommunCode;
  name: string;
};

/** How two neighbors are linked: a land border, a fixed link or a ferry. */
export type LinkKind = "land" | "fixed" | "ferry";

export type NeighborLink = {
  between: readonly [KommunCode, KommunCode];
  kind: LinkKind;
};

/** Orders link kinds alphabetically, as `neighbors.csv` lists them for a pair. */
export function compareLinkKinds(a: LinkKind, b: LinkKind): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Orders links by pair (each in code order), then by kind. */
export function compareLinks(a: NeighborLink, b: NeighborLink): number {
  return comparePairs(a, b) || compareLinkKinds(a.kind, b.kind);
}

export type GraphVersionSource = {
  id: string;
  startsAtTrip: number;
  kommuner: readonly Kommun[];
  links: readonly NeighborLink[];
  shapes?: KommunShapes;
};

/** GeoJSON FeatureCollection whose features carry `properties.code`. */
export type KommunShapes = {
  type: "FeatureCollection";
  features: readonly {
    type: "Feature";
    properties: { code: KommunCode };
    geometry: unknown;
  }[];
};

/** One graph version, loaded as a unit (ADR 0004). */
export type GraphVersion = {
  id: string;
  startsAtTrip: number;
  kommuner: ReadonlyMap<KommunCode, Kommun>;
  links: readonly NeighborLink[];
  neighbors: ReadonlyMap<KommunCode, ReadonlySet<KommunCode>>;
  ferryLinks: readonly NeighborLink[];
  /** Kommuner linked to others only by ferry: a route may start or end there, never pass through. */
  deadEnds: ReadonlySet<KommunCode>;
  shapes: KommunShapes;
};

export function buildGraphVersion(source: GraphVersionSource): GraphVersion {
  const kommuner = new Map<KommunCode, Kommun>();
  for (const kommun of source.kommuner) {
    if (kommuner.has(kommun.code)) {
      throw new Error(`Graph version ${source.id}: duplicate kommun code ${kommun.code}`);
    }
    kommuner.set(kommun.code, kommun);
  }

  const neighbors = new Map<KommunCode, Set<KommunCode>>();
  const hasNonFerryLink = new Set<KommunCode>();
  for (const code of kommuner.keys()) {
    neighbors.set(code, new Set());
  }
  for (const link of source.links) {
    const [a, b] = link.between;
    for (const code of link.between) {
      if (!kommuner.has(code)) {
        throw new Error(`Graph version ${source.id}: link uses unknown kommun code ${code}`);
      }
    }
    if (a === b) {
      throw new Error(`Graph version ${source.id}: kommun ${a} linked to itself`);
    }
    neighbors.get(a)?.add(b);
    neighbors.get(b)?.add(a);
    if (link.kind !== "ferry") {
      hasNonFerryLink.add(a);
      hasNonFerryLink.add(b);
    }
  }

  const deadEnds = new Set<KommunCode>();
  for (const [code, linked] of neighbors) {
    if (linked.size > 0 && !hasNonFerryLink.has(code)) {
      deadEnds.add(code);
    }
  }

  return {
    id: source.id,
    startsAtTrip: source.startsAtTrip,
    kommuner,
    links: source.links,
    neighbors,
    ferryLinks: source.links.filter((link) => link.kind === "ferry"),
    deadEnds,
    shapes: source.shapes ?? { type: "FeatureCollection", features: [] },
  };
}

export function kommunName(graph: GraphVersion, code: KommunCode): string {
  const kommun = graph.kommuner.get(code);
  if (!kommun) {
    throw new Error(`Graph version ${graph.id}: unknown kommun code ${code}`);
  }
  return kommun.name;
}
