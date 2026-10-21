import { describe, expect, test } from "bun:test";
import { newGame } from "../engine/game";
import { buildGraphVersion } from "../graph/graphVersion";
import {
  applyGuessInput,
  type GuessInputEvent,
  type GuessSession,
  suggestKommuner,
} from "./guessSession";

const graph = buildGraphVersion({
  id: "test",
  startsAtPuzzle: 1,
  kommuner: [
    { code: "0643", name: "Habo" },
    { code: "0305", name: "Håbo" },
    { code: "0139", name: "Upplands-Bro" },
    { code: "1880", name: "Örebro" },
    { code: "0180", name: "Stockholm" },
  ],
  links: [
    { between: ["0305", "0139"], kind: "land" },
    { between: ["0139", "0180"], kind: "land" },
  ],
});

const puzzle = { number: 1, start: "0305", destination: "0180" };

const names = (text: string, game = newGame(puzzle)) =>
  suggestKommuner(graph, game, text).map((suggestion) => suggestion.name);

describe("suggestKommuner", () => {
  test("text that fuzzy-matches both Habo and Håbo suggests both", () => {
    expect(names("hbo")).toEqual(expect.arrayContaining(["Habo", "Håbo"]));
  });

  test("a literal match ranks above an accent-folded one", () => {
    expect(names("habo").slice(0, 2)).toEqual(["Habo", "Håbo"]);
    expect(names("håbo").slice(0, 2)).toEqual(["Håbo", "Habo"]);
  });

  test("a prefix ranks above a later match", () => {
    expect(names("s")).toEqual(["Stockholm", "Upplands-Bro"]);
  });

  test("matches ignore case, spacing, hyphens and accents", () => {
    expect(names("UPPLANDS BRO")).toEqual(["Upplands-Bro"]);
    expect(names("orebro")).toEqual(["Örebro"]);
  });

  test("blank text suggests nothing", () => {
    expect(names("  ")).toEqual([]);
  });

  test("guessed kommuner and the endpoints are suggested but disabled and tagged", () => {
    const game = { ...newGame(puzzle), guesses: ["0139"] };
    const suggestions = suggestKommuner(graph, game, "o");
    const tagOf = (name: string) => suggestions.find((s) => s.name === name)?.disabled;
    expect(tagOf("Upplands-Bro")).toBe("redan gissad");
    expect(tagOf("Håbo")).toBe("start");
    expect(tagOf("Stockholm")).toBe("mål");
    expect(tagOf("Habo")).toBeUndefined();
  });
});

const play = (
  events: GuessInputEvent[],
  from: GuessSession = { game: newGame(puzzle), text: "" },
) => events.reduce((session, event) => applyGuessInput(graph, session, event), from);

const type = (text: string): GuessInputEvent => ({ type: "type", text });
const enter: GuessInputEvent = { type: "enter" };
const gissa: GuessInputEvent = { type: "gissa" };
const down: GuessInputEvent = { type: "arrow", direction: "down" };
const up: GuessInputEvent = { type: "arrow", direction: "up" };
const pick = (code: string): GuessInputEvent => ({ type: "pick", code });

describe("applyGuessInput", () => {
  test("Enter on an exact match submits it and clears the field", () => {
    const session = play([type("upplands bro"), enter]);
    expect(session.game.guesses).toEqual(["0139"]);
    expect(session.text).toBe("");
    expect(session.toast).toBeUndefined();
  });

  test.each([
    ["an already guessed kommun", ["1880"], "orebro", "Redan gissad: orebro", ""],
    ["the start", [], "håbo", "Det är start-/målkommunen: håbo", ""],
    ["the destination", [], "Stockholm", "Det är start-/målkommunen: Stockholm", ""],
  ])("submitting %s shows its toast and clears the field", (_, guesses, text, toast, kept) => {
    const from = { game: { ...newGame(puzzle), guesses }, text: "" };
    const session = play([type(text), enter], from);
    expect(session.toast).toBe(toast);
    expect(session.text).toBe(kept);
    expect(session.game.guesses).toEqual(guesses);
  });

  test("Enter on an unknown name with no suggestions shows its toast and keeps the field", () => {
    const session = play([type("Bålsta x"), enter]);
    expect(session.toast).toBe("Okänd kommun: Bålsta x");
    expect(session.text).toBe("Bålsta x");
    expect(session.game.guesses).toEqual([]);
  });

  test("submitting after the game is over shows its toast and clears the field", () => {
    const won = { ...newGame(puzzle), guesses: ["0139"] };
    const session = play([type("Habo"), enter], { game: won, text: "" });
    expect(session.toast).toBe("Spelet är slut");
    expect(session.text).toBe("");
    expect(session.game).toBe(won);
  });

  test("an accepted guess clears an earlier toast", () => {
    const session = play([type("Bålsta x"), enter, type("Upplands-Bro"), enter]);
    expect(session.toast).toBeUndefined();
  });

  test("Enter on text that isn't an exact match fills in the top suggestion without submitting", () => {
    const filled = play([type("uppl"), enter]);
    expect(filled.text).toBe("Upplands-Bro");
    expect(filled.game.guesses).toEqual([]);
    expect(filled.toast).toBeUndefined();

    expect(play([type("uppl"), enter, enter]).game.guesses).toEqual(["0139"]);
  });

  test("Enter fills in the top suggestion that can be picked", () => {
    // "håb" suggests Håbo (start) before Habo; only Habo can be picked.
    expect(play([type("håb"), enter]).text).toBe("Habo");
  });

  test("the arrow keys skip disabled suggestions and wrap around", () => {
    // "o" suggests Örebro, Habo, Håbo (start), Stockholm (mål), Upplands-Bro.
    const highlights = (events: GuessInputEvent[]) => play([type("o"), ...events]).highlighted;
    const options = suggestKommuner(graph, newGame(puzzle), "o").filter((s) => !s.disabled);
    expect(options.map((s) => s.name)).toEqual(["Örebro", "Habo", "Upplands-Bro"]);

    expect(highlights([down])).toBe("1880");
    expect(highlights([down, down])).toBe("0643");
    expect(highlights([down, down, down])).toBe("0139");
    expect(highlights([down, down, down, down])).toBe("1880");
    expect(highlights([up])).toBe("0139");
  });

  test("Enter on a highlighted suggestion only fills the field", () => {
    const filled = play([type("o"), down, down, enter]);
    expect(filled.text).toBe("Habo");
    expect(filled.highlighted).toBeUndefined();
    expect(filled.game.guesses).toEqual([]);
  });

  test("clicking a suggestion only fills the field", () => {
    const filled = play([type("o"), pick("0139")]);
    expect(filled.text).toBe("Upplands-Bro");
    expect(filled.game.guesses).toEqual([]);
  });

  test("a disabled suggestion can't be clicked", () => {
    expect(play([type("o"), pick("0305")]).text).toBe("o");
  });

  test("typing clears the highlight", () => {
    expect(play([type("o"), down, type("or")]).highlighted).toBeUndefined();
  });

  test("Gissa submits an exact match", () => {
    expect(play([type("upplands bro"), gissa]).game.guesses).toEqual(["0139"]);
  });

  test("Gissa never fills in a suggestion", () => {
    const rejected = play([type("uppl"), gissa]);
    expect(rejected.text).toBe("uppl");
    expect(rejected.toast).toBe("Okänd kommun: uppl");
    expect(rejected.game.guesses).toEqual([]);

    expect(play([type("o"), down, gissa]).toast).toBe("Okänd kommun: o");
  });

  test("Enter and Gissa on blank text do nothing", () => {
    const from = { game: newGame(puzzle), text: " " };
    expect(play([enter], from)).toEqual(from);
    expect(play([gissa], from)).toEqual(from);
  });
});
