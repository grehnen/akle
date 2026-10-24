import { describe, expect, test } from "bun:test";
import type { Game } from "../engine/game";
import { buildGraphVersion } from "../graph/graphVersion";
import { readHistory, recordFinishedGame } from "./history";
import { memoryStorage } from "./storage";

// S ── A ── B ── D (N = 2, guess limit 6), and far-away W1 … W6.
const far = ["W1", "W2", "W3", "W4", "W5", "W6"];
const graph = buildGraphVersion({
  id: "test",
  startsAtTrip: 1,
  kommuner: ["S", "A", "B", "D", ...far].map((code) => ({ code, name: `Kommun ${code}` })),
  links: [
    { between: ["S", "A"], kind: "land" },
    { between: ["A", "B"], kind: "land" },
    { between: ["B", "D"], kind: "land" },
    ...far.slice(1).map((code, index) => ({
      between: [far[index] as string, code] as const,
      kind: "land" as const,
    })),
  ],
});

const game = (number: number, ...guesses: string[]): Game => ({
  trip: { number, start: "S", destination: "D" },
  guesses,
});

describe("the history", () => {
  test("a Perfect win is recorded under its trip number", () => {
    const storage = memoryStorage();
    recordFinishedGame(storage, graph, game(4, "A", "B"));
    expect(readHistory(storage)).toEqual({
      4: { won: true, extra: 0, perfect: true, hintsUsed: 0, emojiLine: "✅✅" },
    });
  });

  test("a win with extra guesses records the extra", () => {
    const storage = memoryStorage();
    recordFinishedGame(storage, graph, game(4, "W1", "A", "B"));
    expect(readHistory(storage)[4]).toEqual({
      won: true,
      extra: 1,
      perfect: false,
      hintsUsed: 0,
      emojiLine: "🟥✅✅",
    });
  });

  test("a loss is recorded without an extra", () => {
    const storage = memoryStorage();
    recordFinishedGame(storage, graph, game(4, ...far));
    expect(readHistory(storage)[4]).toEqual({
      won: false,
      extra: null,
      perfect: false,
      hintsUsed: 0,
      emojiLine: "🟥🟥🟥🟥🟥🟥",
    });
  });

  test("records the hints used, which rule out Perfect", () => {
    const storage = memoryStorage();
    recordFinishedGame(storage, graph, {
      ...game(4, "A", "B"),
      hints: { taken: 2, nextKommun: "A" },
    });
    expect(readHistory(storage)[4]).toEqual({
      won: true,
      extra: 0,
      perfect: false,
      hintsUsed: 2,
      emojiLine: "✅✅",
    });
  });

  test("an unfinished game is not recorded", () => {
    const storage = memoryStorage();
    recordFinishedGame(storage, graph, game(4, "A"));
    expect(readHistory(storage)).toEqual({});
  });

  test("finishing a trip again keeps its one first entry", () => {
    const storage = memoryStorage();
    recordFinishedGame(storage, graph, game(4, "A", "B"));
    recordFinishedGame(storage, graph, game(4, "W1", "A", "B"));
    expect(Object.keys(readHistory(storage))).toEqual(["4"]);
    expect(readHistory(storage)[4]?.perfect).toBe(true);
  });

  test("keeps the entries of earlier trips", () => {
    const storage = memoryStorage();
    recordFinishedGame(storage, graph, game(4, "A", "B"));
    recordFinishedGame(storage, graph, game(5, ...far));
    expect(readHistory(storage)[4]?.won).toBe(true);
    expect(readHistory(storage)[5]?.won).toBe(false);
  });

  test("unreadable data reads as an empty history", () => {
    const storage = memoryStorage();
    storage.setItem("akle:history", "[1,2");
    expect(readHistory(storage)).toEqual({});
  });
});
