import { describe, expect, test } from "bun:test";
import { buildGraphVersion } from "../graph/graphVersion";
import { type Game, newGame, reviewGame, submitGuess } from "./game";
import { hintReveals, kommunInitials, takeHint } from "./hints";

/*
 * Three shortest routes from S to T, N = 2:
 *   S ── A ── C ── T
 *   S ── B ── C
 *        B ── E ── T
 * S ── X ── Y ── Z ── T is one kommun longer.
 */
const graph = buildGraphVersion({
  id: "test",
  startsAtPuzzle: 1,
  kommuner: [
    { code: "S", name: "Start" },
    { code: "A", name: "Upplands-Bro" },
    { code: "B", name: "Lilla Edet" },
    { code: "C", name: "Malung-Sälen" },
    { code: "E", name: "Eda" },
    { code: "T", name: "Mål" },
    { code: "X", name: "Kommun X" },
    { code: "Y", name: "Kommun Y" },
    { code: "Z", name: "Kommun Z" },
  ],
  links: [
    { between: ["S", "A"], kind: "land" },
    { between: ["A", "C"], kind: "land" },
    { between: ["S", "B"], kind: "land" },
    { between: ["B", "C"], kind: "land" },
    { between: ["C", "T"], kind: "land" },
    { between: ["B", "E"], kind: "land" },
    { between: ["E", "T"], kind: "land" },
    { between: ["S", "X"], kind: "land" },
    { between: ["X", "Y"], kind: "land" },
    { between: ["Y", "Z"], kind: "land" },
    { between: ["Z", "T"], kind: "land" },
  ],
});

const puzzle = { number: 1, start: "S", destination: "T" };

function guess(game: Game, ...names: string[]): Game {
  for (const name of names) {
    const result = submitGuess(graph, game, name);
    if (result.kind !== "accepted") throw new Error(`${name} was rejected: ${result.reason}`);
    game = result.game;
  }
  return game;
}

const nextKommunAfter = (...names: string[]) =>
  hintReveals(graph, takeHint(graph, guess(newGame(puzzle), ...names))).outlines;

describe("hint 1: the next kommun", () => {
  test("taken before any guess, outlines the start's neighbor on the route first by kommun code", () => {
    expect(nextKommunAfter()).toEqual(["A"]);
  });

  test("follows the route with the fewest unguessed kommuner", () => {
    expect(nextKommunAfter("Eda")).toEqual(["B"]);
  });

  test("breaks a tie by kommun code", () => {
    expect(nextKommunAfter("Malung-Sälen")).toEqual(["A"]);
  });

  test("is the first unguessed kommun next to the start's connected group", () => {
    expect(nextKommunAfter("Lilla Edet")).toEqual(["C"]);
  });

  test("follows the cheapest route, where guessed kommuner are free, even when it is longer", () => {
    expect(nextKommunAfter("Kommun X", "Kommun Y")).toEqual(["Z"]);
  });

  test("stays put when later guesses change the best route", () => {
    const hinted = takeHint(graph, newGame(puzzle));
    expect(hintReveals(graph, guess(hinted, "Eda")).outlines).toEqual(["A"]);
  });
});

describe("taking hints", () => {
  test("never costs a guess", () => {
    const game = takeHint(graph, guess(newGame(puzzle), "Eda"));
    const review = reviewGame(graph, game);
    expect(review.cards).toHaveLength(1);
    expect(review.hintsUsed).toBe(1);
  });

  test("allows three hints, then no more", () => {
    let game = newGame(puzzle);
    for (let taken = 0; taken < 5; taken++) game = takeHint(graph, game);
    expect(reviewGame(graph, game).hintsUsed).toBe(3);
  });

  test("is not possible once the game has ended", () => {
    const won = guess(newGame(puzzle), "Upplands-Bro", "Malung-Sälen");
    expect(takeHint(graph, won)).toBe(won);
  });
});

describe("what the hints reveal", () => {
  test("no hints: no outlines, and names stay hidden", () => {
    expect(hintReveals(graph, newGame(puzzle))).toEqual({ outlines: [], initials: false });
  });

  test("hint 2 outlines every kommun", () => {
    const game = takeHint(graph, takeHint(graph, newGame(puzzle)));
    expect(hintReveals(graph, game).outlines.sort()).toEqual(
      ["S", "A", "B", "C", "E", "T", "X", "Y", "Z"].sort(),
    );
    expect(hintReveals(graph, game).initials).toBe(false);
  });

  test("hint 3 reveals the initials", () => {
    const game = takeHint(graph, takeHint(graph, takeHint(graph, newGame(puzzle))));
    expect(hintReveals(graph, game).initials).toBe(true);
  });
});

describe("Perfekt", () => {
  test("a win with every guess ✅ but a hint taken is not Perfekt", () => {
    const clean = guess(newGame(puzzle), "Upplands-Bro", "Malung-Sälen");
    expect(reviewGame(graph, clean).perfect).toBe(true);

    const hinted = guess(takeHint(graph, newGame(puzzle)), "Upplands-Bro", "Malung-Sälen");
    const review = reviewGame(graph, hinted);
    expect(review.status).toBe("won");
    expect(review.perfect).toBe(false);
  });
});

describe("kommunInitials", () => {
  test("shows the initial of each word, split at spaces and hyphens", () => {
    expect(kommunInitials("Upplands-Bro")).toBe("U… B…");
    expect(kommunInitials("Lilla Edet")).toBe("L… E…");
    expect(kommunInitials("Eda")).toBe("E…");
    expect(kommunInitials("Malung-Sälen")).toBe("M… S…");
  });
});
