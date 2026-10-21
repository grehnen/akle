import { describe, expect, test } from "bun:test";
import { newGame, reviewGame, submitGuess, type Game } from "../engine/game";
import { buildGraphVersion, type KommunCode } from "../graph/graphVersion";
import { endpointBounds, mapFeatures } from "./mapFeatures";

function square(code: KommunCode, west: number, south: number) {
  return {
    type: "Feature" as const,
    properties: { code },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [west, south],
          [west + 1, south],
          [west + 1, south + 1],
          [west, south + 1],
          [west, south],
        ],
      ],
    },
  };
}

// A row of kommuner: A – B – C – D – E, plus an unrelated F.
const graphSource = {
  id: "test",
  startsAtPuzzle: 1,
  kommuner: ["A", "B", "C", "D", "E", "F"].map((code) => ({ code, name: `Kommun ${code}` })),
  links: [
    { between: ["A", "B"], kind: "land" },
    { between: ["B", "C"], kind: "land" },
    { between: ["C", "D"], kind: "land" },
    { between: ["D", "E"], kind: "land" },
  ] as const,
};
const graph = buildGraphVersion({
  ...graphSource,
  shapes: {
    type: "FeatureCollection",
    features: [
      square("A", 12, 56),
      square("B", 13, 56),
      square("C", 14, 56),
      square("D", 15, 57),
      square("E", 16, 58),
      square("F", 20, 65),
    ],
  },
});
const shapeless = buildGraphVersion(graphSource);

const puzzle = { number: 7, start: "A", destination: "E" };

function play(...names: string[]): Game {
  let game = newGame(puzzle);
  for (const name of names) {
    const result = submitGuess(graph, game, name);
    if (result.kind !== "accepted") throw new Error(`guess ${name} was ${result.reason}`);
    game = result.game;
  }
  return game;
}

function drawn(game: Game) {
  return mapFeatures(graph, puzzle, reviewGame(graph, game).cards).features.map(
    (feature) => feature.properties,
  );
}

describe("mapFeatures", () => {
  test("draws only the start and destination before any guess", () => {
    expect(drawn(play())).toEqual([
      { code: "A", kind: "start", color: "#fecc02", connected: true },
      { code: "E", kind: "destination", color: "#006aa7", connected: true },
    ]);
  });

  test("draws a guess not connected to the start in grey with a dashed outline", () => {
    expect(drawn(play("Kommun C"))).toContainEqual({
      code: "C",
      kind: "guess",
      color: "#9ca3af",
      connected: false,
    });
  });

  test("a guess turns solid green once a later guess connects it to the start", () => {
    expect(drawn(play("Kommun C", "Kommun B")).slice(2)).toEqual([
      { code: "C", kind: "guess", color: "#4ade80", connected: true },
      { code: "B", kind: "guess", color: "#4ade80", connected: true },
    ]);
  });

  test("takes each feature's geometry from the graph version's shapes", () => {
    const [start] = mapFeatures(graph, puzzle, []).features;
    expect(start?.geometry).toEqual(square("A", 12, 56).geometry);
  });

  test("skips kommuner that have no shape", () => {
    expect(mapFeatures(shapeless, puzzle, []).features).toEqual([]);
  });
});

describe("endpointBounds", () => {
  test("spans both endpoint shapes as [west, south, east, north]", () => {
    expect(endpointBounds(graph, puzzle)).toEqual([12, 56, 17, 59]);
  });

  test("is undefined when the endpoints have no shapes", () => {
    expect(endpointBounds(shapeless, puzzle)).toBeUndefined();
  });
});
