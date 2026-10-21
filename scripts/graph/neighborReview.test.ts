import { describe, expect, test } from "bun:test";
import type { NeighborOverrides } from "./neighborOverrides";
import { reviewNeighborGraph, type BuildEvidence } from "./neighborReview";

const kommuner = [
  { code: "0001", name: "Ada" },
  { code: "0002", name: "Bo" },
  { code: "0003", name: "Cil" },
  { code: "0004", name: "Dal" },
];

/** A chain 0001–0002–0003–0004 of long land borders, all matching SCB. */
function evidence(changes: Partial<BuildEvidence> = {}): BuildEvidence {
  return {
    kommuner,
    shapeCodes: kommuner.map((kommun) => kommun.code),
    landBorders: [
      { between: ["0001", "0002"], landLength: 5000, at: [18, 59] },
      { between: ["0002", "0003"], landLength: 3000, at: [18.1, 59] },
      { between: ["0003", "0004"], landLength: 2000, at: [18.2, 59] },
    ],
    pointTouches: [],
    fixedLinks: [],
    scbPairs: [
      { between: ["0001", "0002"], at: [18, 59] },
      { between: ["0002", "0003"], at: [18.1, 59] },
      { between: ["0003", "0004"], at: [18.2, 59] },
    ],
    ...changes,
  };
}

const noOverrides: NeighborOverrides = { ferries: [], overrides: [], reviewed: [] };

describe("reviewNeighborGraph", () => {
  test("a clean graph has its land links, no flags and no problems", () => {
    const review = reviewNeighborGraph(evidence(), noOverrides);
    expect(review.links).toEqual([
      { between: ["0001", "0002"], kind: "land" },
      { between: ["0002", "0003"], kind: "land" },
      { between: ["0003", "0004"], kind: "land" },
    ]);
    expect(review.flaggedPairs).toEqual([]);
    expect(review.problems).toEqual([]);
    expect(review.graphProblems).toEqual([]);
  });

  test("flags a land border under 100 m with its length", () => {
    const review = reviewNeighborGraph(
      evidence({
        landBorders: [
          { between: ["0001", "0002"], landLength: 5000, at: [18, 59] },
          { between: ["0002", "0003"], landLength: 42, at: [18.1, 59] },
          { between: ["0003", "0004"], landLength: 100, at: [18.2, 59] },
        ],
      }),
      noOverrides,
    );
    expect(review.flaggedPairs).toEqual([
      { between: ["0002", "0003"], kinds: ["short-border"], landLength: 42, at: [18.1, 59] },
    ]);
  });

  test("flags a single-point touch on land, which is not a neighbor", () => {
    const review = reviewNeighborGraph(
      evidence({ pointTouches: [{ between: ["0004", "0001"], at: [18.3, 59] }] }),
      noOverrides,
    );
    expect(review.flaggedPairs).toEqual([
      { between: ["0001", "0004"], kinds: ["point-touch"], at: [18.3, 59] },
    ]);
    expect(review.links).toHaveLength(3);
  });

  test("flags a pair linked only by a fixed link, with its way ids", () => {
    const review = reviewNeighborGraph(
      evidence({
        landBorders: [
          { between: ["0001", "0002"], landLength: 5000, at: [18, 59] },
          { between: ["0002", "0003"], landLength: 0, at: [18.1, 59] },
          { between: ["0003", "0004"], landLength: 2000, at: [18.2, 59] },
        ],
        fixedLinks: [
          { between: ["0002", "0003"], ways: [7, 9] },
          { between: ["0003", "0004"], ways: [11] },
        ],
      }),
      noOverrides,
    );
    expect(review.links).toEqual([
      { between: ["0001", "0002"], kind: "land" },
      { between: ["0002", "0003"], kind: "fixed" },
      { between: ["0003", "0004"], kind: "fixed" },
      { between: ["0003", "0004"], kind: "land" },
    ]);
    expect(review.flaggedPairs).toEqual([
      {
        between: ["0002", "0003"],
        kinds: ["fixed-only"],
        landLength: 0,
        ways: [7, 9],
        at: [18.1, 59],
      },
    ]);
  });

  test("flags pairs found only by SCB or only by OSM", () => {
    const review = reviewNeighborGraph(
      evidence({
        scbPairs: [
          { between: ["0001", "0002"], at: [18, 59] },
          { between: ["0002", "0003"], at: [18.1, 59] },
          { between: ["0001", "0003"], at: [18.05, 59.1] },
        ],
      }),
      noOverrides,
    );
    expect(review.flaggedPairs).toEqual([
      { between: ["0001", "0003"], kinds: ["scb-mismatch"], scb: "only SCB", at: [18.05, 59.1] },
      {
        between: ["0003", "0004"],
        kinds: ["scb-mismatch"],
        scb: "only OSM",
        landLength: 2000,
        at: [18.2, 59],
      },
    ]);
  });

  test("lists every flag kind a pair has", () => {
    const review = reviewNeighborGraph(
      evidence({
        landBorders: [
          { between: ["0001", "0002"], landLength: 5000, at: [18, 59] },
          { between: ["0002", "0003"], landLength: 3000, at: [18.1, 59] },
          { between: ["0003", "0004"], landLength: 20, at: [18.2, 59] },
        ],
        scbPairs: [
          { between: ["0001", "0002"], at: [18, 59] },
          { between: ["0002", "0003"], at: [18.1, 59] },
        ],
      }),
      noOverrides,
    );
    expect(review.flaggedPairs.map((flag) => flag.kinds)).toEqual([
      ["scb-mismatch", "short-border"],
    ]);
  });

  const shortBo = evidence({
    landBorders: [
      { between: ["0001", "0002"], landLength: 5000, at: [18, 59] },
      { between: ["0002", "0003"], landLength: 42, at: [18.1, 59] },
      { between: ["0003", "0004"], landLength: 2000, at: [18.2, 59] },
    ],
  });

  test("fails on a flag without a verdict", () => {
    const review = reviewNeighborGraph(shortBo, noOverrides);
    expect(review.flaggedPairs[0].verdict).toBeUndefined();
    expect(review.problems).toEqual([
      "0002-0003 (Bo–Cil) is flagged short-border but has no verdict",
    ]);
  });

  test("a keep covering every flag kind is the pair's verdict", () => {
    const review = reviewNeighborGraph(shortBo, {
      ...noOverrides,
      reviewed: [{ between: ["0002", "0003"], kinds: ["short-border"], reason: "Real." }],
    });
    expect(review.flaggedPairs[0].verdict).toEqual({ action: "keep", reason: "Real." });
    expect(review.problems).toEqual([]);
  });

  test("fails on a reviewed pair now flagged for a new kind", () => {
    const review = reviewNeighborGraph(
      { ...shortBo, scbPairs: shortBo.scbPairs.filter((pair) => pair.between[0] !== "0002") },
      {
        ...noOverrides,
        reviewed: [{ between: ["0002", "0003"], kinds: ["short-border"], reason: "Real." }],
      },
    );
    expect(review.problems).toEqual([
      "0002-0003 (Bo–Cil) is now also flagged scb-mismatch, which its keep doesn't cover",
    ]);
  });

  test("fails on a keep for a pair or a kind no longer flagged", () => {
    const review = reviewNeighborGraph(shortBo, {
      ...noOverrides,
      reviewed: [
        { between: ["0002", "0003"], kinds: ["short-border", "point-touch"], reason: "Real." },
        { between: ["0001", "0002"], kinds: ["short-border"], reason: "Was short." },
      ],
    });
    expect(review.problems).toEqual([
      "0001-0002 (Ada–Bo): stale keep, the pair is no longer flagged; delete the entry",
      "0002-0003 (Bo–Cil): stale keep, the pair is no longer flagged point-touch; drop the kind",
    ]);
  });

  test("a remove takes the pair out of the graph and is its verdict", () => {
    const review = reviewNeighborGraph(shortBo, {
      ...noOverrides,
      overrides: [
        {
          between: ["0002", "0003"],
          action: "remove",
          reason: "Sliver.",
          evidence: "https://example.org/sliver",
        },
      ],
    });
    expect(review.links.map((link) => link.between.join("-"))).toEqual(["0001-0002", "0003-0004"]);
    expect(review.flaggedPairs[0].verdict).toEqual({
      action: "remove",
      reason: "Sliver.",
      evidence: "https://example.org/sliver",
    });
    expect(review.problems.filter((problem) => problem.includes("verdict"))).toEqual([]);
  });

  test("an add puts the pair in the graph with its link", () => {
    const review = reviewNeighborGraph(
      evidence({ pointTouches: [{ between: ["0001", "0004"], at: [18.3, 59] }] }),
      {
        ...noOverrides,
        overrides: [
          {
            between: ["0001", "0004"],
            action: "add",
            link: "land",
            reason: "A real border.",
            evidence: "https://example.org/border",
          },
        ],
      },
    );
    expect(review.links).toContainEqual({ between: ["0001", "0004"], kind: "land" });
    expect(review.flaggedPairs[0].verdict?.action).toBe("add");
    expect(review.problems).toEqual([]);
  });

  test("fails on a remove for a missing pair and an add for a pair the graph already finds", () => {
    const review = reviewNeighborGraph(evidence(), {
      ...noOverrides,
      overrides: [
        {
          between: ["0001", "0002"],
          action: "add",
          link: "land",
          reason: "r",
          evidence: "https://e",
        },
        { between: ["0001", "0004"], action: "remove", reason: "r", evidence: "https://e" },
      ],
    });
    expect(review.problems).toEqual([
      "0001-0002 (Ada–Bo): stale add, the graph already finds the pair; delete the entry",
      "0001-0004 (Ada–Dal): stale remove, the graph doesn't contain the pair; delete the entry",
    ]);
  });

  test("ships the ferries as ferry links", () => {
    const review = reviewNeighborGraph(evidence(), {
      ...noOverrides,
      ferries: [{ between: ["0004", "0001"], kind: "ferry" }],
    });
    expect(review.links).toContainEqual({ between: ["0001", "0004"], kind: "ferry" });
  });

  test("fails on a kommun with no neighbors", () => {
    const base = evidence();
    const review = reviewNeighborGraph(
      {
        ...base,
        landBorders: base.landBorders.slice(0, 2),
        scbPairs: base.scbPairs.slice(0, 2),
      },
      noOverrides,
    );
    expect(review.graphProblems).toEqual(["Dal (0004) has no neighbors"]);
  });

  test("fails on kommuner the rest of the graph can't reach", () => {
    const base = evidence();
    const review = reviewNeighborGraph(
      {
        ...base,
        kommuner: [...kommuner, { code: "0005", name: "Eke" }, { code: "0006", name: "Fur" }],
        shapeCodes: [...base.shapeCodes, "0005", "0006"],
        landBorders: [
          ...base.landBorders,
          { between: ["0005", "0006"], landLength: 900, at: [19, 60] },
        ],
        scbPairs: [...base.scbPairs, { between: ["0005", "0006"], at: [19, 60] }],
      },
      noOverrides,
    );
    expect(review.graphProblems).toEqual([
      "Eke (0005), Fur (0006) can't be reached from the rest of the graph",
    ]);
  });

  test("fails on a code missing from or extra to SCB's list", () => {
    const review = reviewNeighborGraph(
      evidence({ shapeCodes: ["0001", "0002", "0003", "0099"] }),
      noOverrides,
    );
    expect(review.graphProblems).toEqual([
      "Dal (0004) is in SCB's list but has no OSM boundary",
      "0099 has an OSM boundary but isn't in SCB's list",
    ]);
  });
});
