import { describe, expect, test } from "bun:test";
import type { NeighborOverrides } from "./neighborOverrides";
import { reviewNeighborGraph, type BuildEvidence } from "./neighborReview";

const kommuner = [
  { code: "0001", name: "Ada" },
  { code: "0002", name: "Bo" },
  { code: "0003", name: "Cil" },
  { code: "0004", name: "Dal" },
];

type LandBorder = BuildEvidence["landBorders"][number];
/** A land border, all on the mainland, off any exclave and out of rivers unless it says otherwise. */
type TestBorder = Omit<
  LandBorder,
  "mainlandLength" | "islandLength" | "riverLength" | "exclaveOf"
> &
  Partial<LandBorder>;

/** A chain 0001–0002–0003–0004 of long land borders, all matching SCB. */
function evidence(
  changes: Omit<Partial<BuildEvidence>, "landBorders"> & {
    landBorders?: TestBorder[];
  } = {},
): BuildEvidence {
  const landBorders: TestBorder[] = changes.landBorders ?? [
    { between: ["0001", "0002"], landLength: 5000, at: [18, 59] },
    { between: ["0002", "0003"], landLength: 3000, at: [18.1, 59] },
    { between: ["0003", "0004"], landLength: 2000, at: [18.2, 59] },
  ];
  return {
    kommuner,
    shapeCodes: kommuner.map((kommun) => kommun.code),
    pointTouches: [],
    fixedLinks: [],
    scbPairs: [
      { between: ["0001", "0002"], at: [18, 59] },
      { between: ["0002", "0003"], at: [18.1, 59] },
      { between: ["0003", "0004"], at: [18.2, 59] },
    ],
    ...changes,
    landBorders: landBorders.map((border) => ({
      mainlandLength: border.landLength,
      islandLength: 0,
      riverLength: 0,
      exclaveOf: [],
      ...border,
    })),
  };
}

const noOverrides: NeighborOverrides = {
  ferries: [],
  overrides: [],
  reviewed: [],
};

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
      {
        between: ["0002", "0003"],
        kinds: ["short-border"],
        landLength: 42,
        at: [18.1, 59],
        built: ["land"],
      },
    ]);
  });

  test("flags a land border under 1000 m that lies only on islands, with how it splits", () => {
    const review = reviewNeighborGraph(
      evidence({
        landBorders: [
          {
            between: ["0001", "0002"],
            landLength: 328,
            mainlandLength: 0,
            islandLength: 328,
            at: [18, 59],
          },
          {
            between: ["0002", "0003"],
            landLength: 1000,
            mainlandLength: 0,
            islandLength: 1000,
            at: [18.1, 59],
          },
          {
            between: ["0003", "0004"],
            landLength: 305,
            mainlandLength: 5,
            islandLength: 300,
            at: [18.2, 59],
          },
        ],
        fixedLinks: [{ between: ["0002", "0003"], ways: [7], failures: [] }],
      }),
      noOverrides,
    );
    expect(review.flaggedPairs).toEqual([
      {
        between: ["0001", "0002"],
        kinds: ["island-border"],
        landLength: 328,
        mainlandLength: 0,
        islandLength: 328,
        at: [18, 59],
        built: [],
      },
    ]);
    expect(review.links.map((link) => link.between.join("-"))).toEqual([
      "0002-0003",
      "0002-0003",
      "0003-0004",
    ]);
  });

  describe("an island border of 1000 m or more", () => {
    const withLongIslandBorder = (changes: Omit<Partial<BuildEvidence>, "landBorders"> = {}) =>
      evidence({
        landBorders: [
          { between: ["0001", "0002"], landLength: 5000, at: [18, 59] },
          {
            between: ["0002", "0003"],
            landLength: 1000,
            mainlandLength: 0,
            islandLength: 1000,
            at: [18.1, 59],
          },
          { between: ["0003", "0004"], landLength: 2000, at: [18.2, 59] },
        ],
        ...changes,
      });

    test("makes a land neighbor, flagged when it is the pair's only valid link", () => {
      const review = reviewNeighborGraph(withLongIslandBorder(), noOverrides);
      expect(review.flaggedPairs).toEqual([
        {
          between: ["0002", "0003"],
          kinds: ["island-border"],
          landLength: 1000,
          mainlandLength: 0,
          islandLength: 1000,
          at: [18.1, 59],
          built: ["land"],
        },
      ]);
      expect(review.links).toContainEqual({ between: ["0002", "0003"], kind: "land" });
    });

    test("isn't flagged when a qualifying fixed link also joins the pair", () => {
      const review = reviewNeighborGraph(
        withLongIslandBorder({
          fixedLinks: [{ between: ["0002", "0003"], ways: [7], failures: [] }],
        }),
        noOverrides,
      );
      expect(review.flaggedPairs).toEqual([]);
    });

    test("is flagged when the only fixed link doesn't qualify", () => {
      const review = reviewNeighborGraph(
        withLongIslandBorder({
          fixedLinks: [
            {
              between: ["0002", "0003"],
              ways: [7],
              failures: [{ way: 7, reasons: ["service=driveway"] }],
            },
          ],
        }),
        noOverrides,
      );
      expect(review.flaggedPairs.map(({ between, kinds }) => ({ between, kinds }))).toEqual([
        { between: ["0002", "0003"], kinds: ["island-border"] },
      ]);
    });

    test("isn't flagged when the pair also touches at a point on land", () => {
      const review = reviewNeighborGraph(
        withLongIslandBorder({ pointTouches: [{ between: ["0002", "0003"], at: [18.1, 59.1] }] }),
        noOverrides,
      );
      expect(review.flaggedPairs.map(({ between, kinds }) => ({ between, kinds }))).toEqual([
        { between: ["0002", "0003"], kinds: ["point-touch"] },
      ]);
    });
  });

  test("an island border is also short when under 100 m", () => {
    const review = reviewNeighborGraph(
      evidence({
        landBorders: [
          { between: ["0001", "0002"], landLength: 5000, at: [18, 59] },
          {
            between: ["0002", "0003"],
            landLength: 42,
            mainlandLength: 0,
            islandLength: 42,
            at: [18.1, 59],
          },
          { between: ["0003", "0004"], landLength: 2000, at: [18.2, 59] },
        ],
      }),
      noOverrides,
    );
    expect(review.flaggedPairs.map((flag) => flag.kinds)).toEqual([
      ["short-border", "island-border"],
    ]);
  });

  test("drops and flags a land border that lies wholly on an exclave, at any length", () => {
    const review = reviewNeighborGraph(
      evidence({
        landBorders: [
          { between: ["0001", "0002"], landLength: 5000, at: [18, 59] },
          {
            between: ["0002", "0003"],
            landLength: 8000,
            exclaveOf: ["0003"],
            at: [18.1, 59],
          },
          {
            between: ["0003", "0004"],
            landLength: 0,
            exclaveOf: [],
            at: [18.2, 59],
          },
        ],
        fixedLinks: [{ between: ["0003", "0004"], ways: [11], failures: [] }],
        scbPairs: [
          { between: ["0001", "0002"], at: [18, 59] },
          { between: ["0003", "0004"], at: [18.2, 59] },
        ],
      }),
      noOverrides,
    );
    expect(review.flaggedPairs).toEqual([
      {
        between: ["0002", "0003"],
        kinds: ["exclave-border"],
        landLength: 8000,
        exclaveOf: ["0003"],
        at: [18.1, 59],
        built: [],
      },
    ]);
    expect(review.links).toEqual([
      { between: ["0001", "0002"], kind: "land" },
      { between: ["0003", "0004"], kind: "fixed" },
    ]);
  });

  describe("borders in river water", () => {
    const withRiverBorder = (
      riverLength: number,
      changes: Omit<Partial<BuildEvidence>, "landBorders"> = {},
    ) =>
      evidence({
        landBorders: [
          { between: ["0001", "0002"], landLength: 5000, riverLength: 3000, at: [18, 59] },
          { between: ["0002", "0003"], landLength: 3000, at: [18.1, 59] },
          { between: ["0003", "0004"], landLength: 2000, at: [18.2, 59] },
          { between: ["0001", "0004"], landLength: 0, riverLength, at: [18.3, 59] },
        ],
        scbPairs: [
          { between: ["0001", "0002"], at: [18, 59] },
          { between: ["0002", "0003"], at: [18.1, 59] },
          { between: ["0003", "0004"], at: [18.2, 59] },
          { between: ["0001", "0004"], at: [18.3, 59] },
        ],
        ...changes,
      });

    test("drops and flags a pair whose only border is under 1000 m in river water", () => {
      const review = reviewNeighborGraph(withRiverBorder(999), noOverrides);
      expect(review.flaggedPairs).toEqual([
        {
          between: ["0001", "0004"],
          kinds: ["river-border"],
          landLength: 0,
          riverLength: 999,
          at: [18.3, 59],
          built: [],
        },
      ]);
      expect(review.links.map((link) => link.between.join("-"))).toEqual([
        "0001-0002",
        "0002-0003",
        "0003-0004",
      ]);
    });

    test("a border of 1000 m or more in river water makes a land neighbor, still flagged", () => {
      const review = reviewNeighborGraph(withRiverBorder(1000), noOverrides);
      expect(review.flaggedPairs).toEqual([
        {
          between: ["0001", "0004"],
          kinds: ["river-border"],
          landLength: 0,
          riverLength: 1000,
          at: [18.3, 59],
          built: ["land"],
        },
      ]);
      expect(review.links).toContainEqual({ between: ["0001", "0004"], kind: "land" });
    });

    test("flags a river border that a qualifying fixed link keeps as neighbors", () => {
      const review = reviewNeighborGraph(
        withRiverBorder(400, {
          fixedLinks: [{ between: ["0001", "0004"], ways: [5], failures: [] }],
        }),
        noOverrides,
      );
      expect(
        review.flaggedPairs.map(({ between, kinds, built }) => ({ between, kinds, built })),
      ).toEqual([{ between: ["0001", "0004"], kinds: ["river-border"], built: ["fixed"] }]);
    });

    test("a river border of 1000 m or more isn't flagged when a qualifying fixed link joins the pair", () => {
      const review = reviewNeighborGraph(
        withRiverBorder(1000, {
          fixedLinks: [{ between: ["0001", "0004"], ways: [5], failures: [] }],
        }),
        noOverrides,
      );
      expect(review.flaggedPairs).toEqual([]);
      expect(review.links).toContainEqual({ between: ["0001", "0004"], kind: "land" });
    });

    test("a river border of 1000 m or more is flagged when the only fixed link doesn't qualify", () => {
      const review = reviewNeighborGraph(
        withRiverBorder(1000, {
          fixedLinks: [
            {
              between: ["0001", "0004"],
              ways: [5],
              failures: [{ way: 5, reasons: ["service=driveway"] }],
            },
          ],
        }),
        noOverrides,
      );
      expect(
        review.flaggedPairs.map(({ between, kinds, built }) => ({ between, kinds, built })),
      ).toEqual([{ between: ["0001", "0004"], kinds: ["river-border"], built: ["land"] }]);
    });

    test("a border partly in river water and partly on land is a plain land border", () => {
      const review = reviewNeighborGraph(withRiverBorder(0), noOverrides);
      expect(review.flaggedPairs).toEqual([]);
    });
  });

  test("a single-point touch on land makes a land neighbor, flagged for a human to confirm", () => {
    const review = reviewNeighborGraph(
      evidence({
        pointTouches: [{ between: ["0004", "0001"], at: [18.3, 59] }],
        scbPairs: [
          { between: ["0001", "0002"], at: [18, 59] },
          { between: ["0002", "0003"], at: [18.1, 59] },
          { between: ["0003", "0004"], at: [18.2, 59] },
          { between: ["0001", "0004"], at: [18.3, 59] },
        ],
      }),
      noOverrides,
    );
    expect(review.flaggedPairs).toEqual([
      {
        between: ["0001", "0004"],
        kinds: ["point-touch"],
        at: [18.3, 59],
        built: ["land"],
      },
    ]);
    expect(review.links).toContainEqual({
      between: ["0001", "0004"],
      kind: "land",
    });
    expect(review.links).toHaveLength(4);
  });

  test("an add for a single-point touch is stale, the graph already finds the pair", () => {
    const review = reviewNeighborGraph(
      evidence({
        pointTouches: [{ between: ["0001", "0004"], at: [18.3, 59] }],
      }),
      {
        ...noOverrides,
        overrides: [
          {
            between: ["0001", "0004"],
            action: "add",
            link: "land",
            reason: "A corner on land.",
            evidence: "https://example.org/corner",
          },
        ],
      },
    );
    expect(review.problems).toEqual([
      "0001-0004 (Ada–Dal): stale add, the graph already finds the pair; delete the entry",
    ]);
  });

  test("a qualifying fixed link makes a neighbor without a flag, even with no land border", () => {
    const review = reviewNeighborGraph(
      evidence({
        landBorders: [
          { between: ["0001", "0002"], landLength: 5000, at: [18, 59] },
          { between: ["0002", "0003"], landLength: 0, at: [18.1, 59] },
          { between: ["0003", "0004"], landLength: 2000, at: [18.2, 59] },
        ],
        fixedLinks: [
          { between: ["0002", "0003"], ways: [7, 9], failures: [] },
          { between: ["0003", "0004"], ways: [11], failures: [] },
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
    expect(review.flaggedPairs).toEqual([]);
    expect(review.problems).toEqual([]);
  });

  /** 0002–0003 share only a water border, crossed by a driveway bridge to an islet. */
  const driveway = {
    between: ["0003", "0002"] as const,
    ways: [7, 9],
    failures: [
      {
        way: 9,
        reasons: ["service=driveway" as const, "no-land-end" as const],
      },
    ],
  };
  const waterBorders: TestBorder[] = [
    { between: ["0001", "0002"], landLength: 5000, at: [18, 59] },
    { between: ["0002", "0003"], landLength: 0, at: [18.1, 59] },
    { between: ["0003", "0004"], landLength: 2000, at: [18.2, 59] },
  ];

  test("drops a non-qualifying fixed link and flags the pair with the failing ways", () => {
    const review = reviewNeighborGraph(
      evidence({
        landBorders: waterBorders,
        fixedLinks: [driveway],
        scbPairs: [
          { between: ["0001", "0002"], at: [18, 59] },
          { between: ["0003", "0004"], at: [18.2, 59] },
        ],
      }),
      noOverrides,
    );
    expect(review.links).toEqual([
      { between: ["0001", "0002"], kind: "land" },
      { between: ["0003", "0004"], kind: "land" },
    ]);
    expect(review.flaggedPairs).toEqual([
      {
        between: ["0002", "0003"],
        kinds: ["non-qualifying-link"],
        landLength: 0,
        ways: [7, 9],
        failures: [{ way: 9, reasons: ["service=driveway", "no-land-end"] }],
        at: [18.1, 59],
        built: [],
      },
    ]);
  });

  test("a pair SCB joins but linked only by a non-qualifying link is not an SCB mismatch", () => {
    const review = reviewNeighborGraph(
      evidence({ landBorders: waterBorders, fixedLinks: [driveway] }),
      noOverrides,
    );
    expect(
      review.flaggedPairs.map(({ between, kinds }) => ({
        between,
        kinds,
      })),
    ).toEqual([
      {
        between: ["0002", "0003"],
        kinds: ["non-qualifying-link"],
      },
    ]);
  });

  test("a non-qualifying link next to a land border adds no fixed link and no flag", () => {
    const review = reviewNeighborGraph(
      evidence({ fixedLinks: [{ ...driveway, between: ["0001", "0002"] }] }),
      noOverrides,
    );
    expect(review.links).toEqual([
      { between: ["0001", "0002"], kind: "land" },
      { between: ["0002", "0003"], kind: "land" },
      { between: ["0003", "0004"], kind: "land" },
    ]);
    expect(review.flaggedPairs).toEqual([]);
  });

  /** 0002–0003 share a short land border only on islands, and Bo's exclave holds 0003–0004's. */
  const doubtfulBorders: TestBorder[] = [
    { between: ["0001", "0002"], landLength: 5000, at: [18, 59] },
    {
      between: ["0002", "0003"],
      landLength: 328,
      mainlandLength: 0,
      islandLength: 328,
      at: [18.1, 59],
    },
    {
      between: ["0003", "0004"],
      landLength: 2000,
      exclaveOf: ["0004"],
      at: [18.2, 59],
    },
  ];

  test("a qualifying fixed link keeps a pair whose island or exclave border is dropped", () => {
    const review = reviewNeighborGraph(
      evidence({
        landBorders: doubtfulBorders,
        fixedLinks: [
          { between: ["0002", "0003"], ways: [7], failures: [] },
          { between: ["0003", "0004"], ways: [11], failures: [] },
        ],
      }),
      noOverrides,
    );
    expect(review.links).toEqual([
      { between: ["0001", "0002"], kind: "land" },
      { between: ["0002", "0003"], kind: "fixed" },
      { between: ["0003", "0004"], kind: "fixed" },
    ]);
    expect(
      review.flaggedPairs.map(({ between, kinds, built }) => ({
        between,
        kinds,
        built,
      })),
    ).toEqual([
      { between: ["0002", "0003"], kinds: ["island-border"], built: ["fixed"] },
      {
        between: ["0003", "0004"],
        kinds: ["exclave-border"],
        built: ["fixed"],
      },
    ]);
  });

  test("a non-qualifying link doesn't keep a dropped pair and is flagged with it", () => {
    const review = reviewNeighborGraph(
      evidence({
        landBorders: doubtfulBorders,
        fixedLinks: [{ ...driveway, between: ["0002", "0003"] }],
        scbPairs: [{ between: ["0001", "0002"], at: [18, 59] }],
      }),
      noOverrides,
    );
    expect(review.links).toEqual([{ between: ["0001", "0002"], kind: "land" }]);
    expect(
      review.flaggedPairs.map(({ between, kinds, built }) => ({
        between,
        kinds,
        built,
      })),
    ).toEqual([
      {
        between: ["0002", "0003"],
        kinds: ["non-qualifying-link", "island-border"],
        built: [],
      },
      { between: ["0003", "0004"], kinds: ["exclave-border"], built: [] },
    ]);
  });

  test("an add puts a dropped island or exclave pair back and is its verdict", () => {
    const add = (between: [string, string]) => ({
      between,
      action: "add" as const,
      link: "land" as const,
      reason: "A real border.",
      evidence: "https://example.org/border",
    });
    const review = reviewNeighborGraph(
      evidence({
        landBorders: doubtfulBorders,
        scbPairs: [{ between: ["0001", "0002"], at: [18, 59] }],
      }),
      {
        ...noOverrides,
        overrides: [add(["0002", "0003"]), add(["0003", "0004"])],
      },
    );
    expect(review.links.map((link) => link.between.join("-"))).toEqual([
      "0001-0002",
      "0002-0003",
      "0003-0004",
    ]);
    expect(review.flaggedPairs.filter((flag) => flag.verdict?.action === "add")).toHaveLength(2);
    expect(review.flaggedPairs.map((flag) => flag.built)).toEqual([[], []]);
    expect(review.problems).toEqual([]);
  });

  test("an add with link fixed puts a non-qualifying link back in the graph", () => {
    const review = reviewNeighborGraph(
      evidence({
        landBorders: waterBorders,
        fixedLinks: [driveway],
        scbPairs: [
          { between: ["0001", "0002"], at: [18, 59] },
          { between: ["0003", "0004"], at: [18.2, 59] },
        ],
      }),
      {
        ...noOverrides,
        overrides: [
          {
            between: ["0002", "0003"],
            action: "add",
            link: "fixed",
            reason: "A public road after all.",
            evidence: "https://example.org",
          },
        ],
      },
    );
    expect(review.links).toContainEqual({
      between: ["0002", "0003"],
      kind: "fixed",
    });
    expect(review.flaggedPairs[0].built).toEqual([]);
    expect(review.flaggedPairs[0].verdict?.action).toBe("add");
    expect(review.problems).toEqual([]);
  });

  test("flags pairs found only by OSM, not pairs found only by SCB", () => {
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
      {
        between: ["0003", "0004"],
        kinds: ["scb-mismatch"],
        landLength: 2000,
        at: [18.2, 59],
        built: ["land"],
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
    expect(review.flaggedPairs[0].verdict).toEqual({
      action: "keep",
      reason: "Real.",
    });
    expect(review.problems).toEqual([]);
  });

  test("fails on a reviewed pair now flagged for a new kind", () => {
    const review = reviewNeighborGraph(
      {
        ...shortBo,
        scbPairs: shortBo.scbPairs.filter((pair) => pair.between[0] !== "0002"),
      },
      {
        ...noOverrides,
        reviewed: [
          {
            between: ["0002", "0003"],
            kinds: ["short-border"],
            reason: "Real.",
          },
        ],
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
        {
          between: ["0002", "0003"],
          kinds: ["short-border", "point-touch"],
          reason: "Real.",
        },
        {
          between: ["0001", "0002"],
          kinds: ["short-border"],
          reason: "Was short.",
        },
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
      evidence({
        landBorders: [
          { between: ["0001", "0002"], landLength: 5000, at: [18, 59] },
          { between: ["0002", "0003"], landLength: 3000, at: [18.1, 59] },
          { between: ["0003", "0004"], landLength: 2000, at: [18.2, 59] },
          {
            between: ["0001", "0004"],
            landLength: 300,
            mainlandLength: 0,
            islandLength: 300,
            at: [18.3, 59],
          },
        ],
      }),
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
    expect(review.links).toContainEqual({
      between: ["0001", "0004"],
      kind: "land",
    });
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
        {
          between: ["0001", "0004"],
          action: "remove",
          reason: "r",
          evidence: "https://e",
        },
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
    expect(review.links).toContainEqual({
      between: ["0001", "0004"],
      kind: "ferry",
    });
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
          {
            between: ["0005", "0006"],
            landLength: 900,
            mainlandLength: 900,
            islandLength: 0,
            riverLength: 0,
            exclaveOf: [],
            at: [19, 60],
          },
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
