import { describe, expect, test } from "bun:test";
import { newGame, reviewGame, submitGuess, type Game } from "../engine/game";
import { buildGraphVersion, type KommunCode } from "../graph/graphVersion";
import {
  defaultBounds,
  guessViewBounds,
  mapFeatures,
  routeBounds,
  routeFeatures,
} from "./mapFeatures";

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

  test("draws hint outlines first, white, skipping kommuner already drawn", () => {
    const cards = reviewGame(graph, play("Kommun C")).cards;
    const properties = mapFeatures(graph, puzzle, cards, ["B", "A", "C", "F"]).features.map(
      (feature) => feature.properties,
    );
    expect(properties).toEqual([
      { code: "B", kind: "hint", color: "#ffffff", connected: true },
      { code: "F", kind: "hint", color: "#ffffff", connected: true },
      { code: "A", kind: "start", color: "#fecc02", connected: true },
      { code: "E", kind: "destination", color: "#006aa7", connected: true },
      { code: "C", kind: "guess", color: "#9ca3af", connected: false },
    ]);
  });

  test("once finished, outlines every other kommun underneath, instead of the hint outlines", () => {
    const cards = reviewGame(graph, play("Kommun C")).cards;
    const properties = mapFeatures(graph, puzzle, cards, ["B", "F"], {
      allOutlines: true,
    }).features.map((feature) => feature.properties);
    expect(properties).toEqual([
      { code: "B", kind: "other", color: "#ffffff", connected: true },
      { code: "D", kind: "other", color: "#ffffff", connected: true },
      { code: "F", kind: "other", color: "#ffffff", connected: true },
      { code: "A", kind: "start", color: "#fecc02", connected: true },
      { code: "E", kind: "destination", color: "#006aa7", connected: true },
      { code: "C", kind: "guess", color: "#9ca3af", connected: false },
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

describe("defaultBounds", () => {
  test("without guesses, spans both endpoint shapes as [west, south, east, north]", () => {
    expect(defaultBounds(graph, puzzle, [])).toEqual([12, 56, 17, 59]);
  });

  test("is undefined when the endpoints have no shapes", () => {
    expect(defaultBounds(shapeless, puzzle, [])).toBeUndefined();
  });

  test.each(["✅", "🟩", "🟧"] as const)("takes in an unlinked %s guess", (feedback) => {
    expect(defaultBounds(graph, puzzle, [{ code: "F", feedback, connected: false }])).toEqual([
      12, 56, 21, 66,
    ]);
  });

  test("leaves out an unlinked 🟥 guess", () => {
    expect(defaultBounds(graph, puzzle, [{ code: "F", feedback: "🟥", connected: false }])).toEqual(
      [12, 56, 17, 59],
    );
  });

  test("takes in a 🟥 guess linked to the start", () => {
    const sparse = buildGraphVersion({
      ...graphSource,
      shapes: { type: "FeatureCollection", features: [square("A", 12, 56), square("B", 9, 50)] },
    });
    expect(defaultBounds(sparse, puzzle, [{ code: "B", feedback: "🟥", connected: true }])).toEqual(
      [9, 50, 13, 57],
    );
  });

  test("takes in 🟥 guesses linked to the destination, directly or through other guesses", () => {
    const cards = [
      { code: "C", feedback: "🟥", connected: false },
      { code: "D", feedback: "🟥", connected: false },
    ] as const;
    const sparse = buildGraphVersion({
      ...graphSource,
      shapes: {
        type: "FeatureCollection",
        features: [
          square("A", 12, 56),
          square("E", 16, 58),
          square("C", 30, 60),
          square("D", 25, 70),
        ],
      },
    });
    expect(defaultBounds(sparse, puzzle, cards)).toEqual([12, 56, 31, 71]);
    expect(defaultBounds(sparse, puzzle, cards.slice(0, 1))).toEqual([12, 56, 17, 59]);
  });
});

describe("guessViewBounds", () => {
  test("adds the latest guess to the default bounds even when it isn't part of them", () => {
    expect(
      guessViewBounds(graph, puzzle, [{ code: "F", feedback: "🟥", connected: false }]),
    ).toEqual([12, 56, 21, 66]);
  });

  test("drops an earlier guess that isn't part of the default bounds", () => {
    expect(
      guessViewBounds(graph, puzzle, [
        { code: "F", feedback: "🟥", connected: false },
        { code: "C", feedback: "🟩", connected: false },
      ]),
    ).toEqual([12, 56, 17, 59]);
  });
});

describe("routeFeatures", () => {
  const route = ["A", "B", "C", "D", "E"];

  test("draws guesses off the route like unconnected guesses, then the endpoints, then the route's guessed kommuner green and missed ones red", () => {
    const properties = routeFeatures(graph, puzzle, route, new Set(["C", "F"])).features.map(
      (feature) => feature.properties,
    );
    expect(properties).toEqual([
      { code: "F", kind: "guess", color: "#9ca3af", connected: false },
      { code: "A", kind: "start", color: "#fecc02", connected: true },
      { code: "E", kind: "destination", color: "#006aa7", connected: true },
      { code: "B", kind: "missed", color: "#f87171", connected: false },
      { code: "C", kind: "guess", color: "#4ade80", connected: true },
      { code: "D", kind: "missed", color: "#f87171", connected: false },
    ]);
  });

  test("with allOutlines, outlines every kommun off the route underneath", () => {
    const properties = routeFeatures(graph, puzzle, route, new Set(["C"]), {
      allOutlines: true,
    }).features.map((feature) => feature.properties);
    expect(properties.slice(0, 2)).toEqual([
      { code: "F", kind: "other", color: "#ffffff", connected: true },
      { code: "A", kind: "start", color: "#fecc02", connected: true },
    ]);
    expect(properties).toHaveLength(6);
  });
});

describe("routeBounds", () => {
  test("spans every kommun on the route", () => {
    expect(routeBounds(graph, ["A", "B", "F"])).toEqual([12, 56, 21, 66]);
  });
});
