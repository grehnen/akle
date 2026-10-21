import { describe, expect, test } from "bun:test";
import { newGame } from "../engine/game";
import { buildGraphVersion } from "../graph/graphVersion";
import { loadSavedGame, saveGame } from "./savedGame";
import { memoryStorage } from "./storage";

const graph = buildGraphVersion({
  id: "test",
  startsAtPuzzle: 1,
  kommuner: ["S", "A", "B", "D"].map((code) => ({ code, name: `Kommun ${code}` })),
  links: [
    { between: ["S", "A"], kind: "land" },
    { between: ["A", "B"], kind: "land" },
    { between: ["B", "D"], kind: "land" },
  ],
});

const today = { number: 7, start: "S", destination: "D" };
const tomorrow = { number: 8, start: "S", destination: "D" };

describe("the saved game", () => {
  test("a reload restores today's guesses", () => {
    const storage = memoryStorage();
    saveGame(storage, { puzzle: today, guesses: ["A", "B"] });
    expect(loadSavedGame(storage, graph, today)).toEqual({ puzzle: today, guesses: ["A", "B"] });
  });

  test("a new puzzle number starts a fresh game", () => {
    const storage = memoryStorage();
    saveGame(storage, { puzzle: today, guesses: ["A"] });
    expect(loadSavedGame(storage, graph, tomorrow)).toEqual(newGame(tomorrow));
  });

  test("nothing saved starts a fresh game", () => {
    expect(loadSavedGame(memoryStorage(), graph, today)).toEqual(newGame(today));
  });

  test("unreadable data starts a fresh game", () => {
    const storage = memoryStorage();
    storage.setItem("akle:game", "{not json");
    expect(loadSavedGame(storage, graph, today)).toEqual(newGame(today));
  });

  test("keeps only guesses that are still valid kommuner", () => {
    const storage = memoryStorage();
    storage.setItem(
      "akle:game",
      JSON.stringify({ puzzleNumber: 7, guesses: ["A", "nope", "S", "A", 3, "B"] }),
    );
    expect(loadSavedGame(storage, graph, today).guesses).toEqual(["A", "B"]);
  });
});
