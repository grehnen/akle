import { describe, expect, test } from "bun:test";
import { newGame } from "../engine/game";
import { buildGraphVersion } from "../graph/graphVersion";
import { loadSavedGame, saveGame } from "./savedGame";
import { memoryStorage } from "./storage";

const graph = buildGraphVersion({
  id: "test",
  startsAtTrip: 1,
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
    saveGame(storage, { trip: today, guesses: ["A", "B"] });
    expect(loadSavedGame(storage, graph, today)).toEqual({
      ...newGame(today),
      guesses: ["A", "B"],
    });
  });

  test("a new trip number starts a fresh game", () => {
    const storage = memoryStorage();
    saveGame(storage, { trip: today, guesses: ["A"] });
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
      JSON.stringify({ tripNumber: 7, guesses: ["A", "nope", "S", "A", 3, "B"] }),
    );
    expect(loadSavedGame(storage, graph, today).guesses).toEqual(["A", "B"]);
  });

  test("a reload keeps the hints taken and hint 1's kommun", () => {
    const storage = memoryStorage();
    const game = { ...newGame(today), guesses: ["B"], hints: { taken: 2, nextKommun: "A" } };
    saveGame(storage, game);
    expect(loadSavedGame(storage, graph, today)).toEqual(game);
  });

  test("drops hints that can't be read", () => {
    for (const hints of [
      { taken: 0, nextKommun: "A" },
      { taken: 4, nextKommun: "A" },
      { taken: 1, nextKommun: "nope" },
      "3",
    ]) {
      const storage = memoryStorage();
      storage.setItem("akle:game", JSON.stringify({ tripNumber: 7, guesses: ["B"], hints }));
      expect(loadSavedGame(storage, graph, today).hints).toBeUndefined();
    }
  });
});
