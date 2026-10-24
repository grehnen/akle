import { describe, expect, test } from "bun:test";
import { rejectionMessage, resultOutcome, scoreText } from "./messages";

describe("scoreText", () => {
  test.each([
    [3, "3 poäng"],
    [1, "1 poäng"],
    [0, "0 poäng"],
    [-1, "−1 poäng"],
  ])("%p → %p", (score, text) => {
    expect(scoreText(score)).toBe(text);
  });
});

describe("rejectionMessage", () => {
  test.each([
    ["unknown", "Okänd kommun: Bålsta"],
    ["repeat", "Redan gissad: Bålsta"],
    ["endpoint", "Det är start-/målkommunen: Bålsta"],
    ["game-over", "Spelet är slut"],
  ] as const)("%s → %p", (reason, message) => {
    expect(rejectionMessage(reason, "Bålsta")).toBe(message);
  });
});

describe("resultOutcome", () => {
  test("a Perfect win", () => {
    expect(resultOutcome({ status: "won", extra: 0, perfect: true, away: 0 })).toBe("Perfekt!");
  });

  test("a win with extra guesses", () => {
    expect(resultOutcome({ status: "won", extra: 2, perfect: false, away: 0 })).toBe(
      "Framme! (+2)",
    );
    expect(resultOutcome({ status: "won", extra: 0, perfect: false, away: 0 })).toBe(
      "Framme! (+0)",
    );
  });

  test("a win with hints shows them", () => {
    expect(resultOutcome({ status: "won", extra: 1, perfect: false, away: 0, hintsUsed: 1 })).toBe(
      "Framme! (+1, 1 ledtråd)",
    );
  });

  test("a loss counts how many kommuner away the player ended", () => {
    expect(resultOutcome({ status: "lost", perfect: false, away: 3 })).toBe(
      "Slut på gissningar (3 ifrån)",
    );
  });

  test("a give-up says so instead of running out of guesses", () => {
    expect(resultOutcome({ status: "lost", perfect: false, away: 3, givenUp: true })).toBe(
      "Gav upp (3 ifrån)",
    );
    expect(
      resultOutcome({ status: "lost", perfect: false, away: 1, givenUp: true, hintsUsed: 2 }),
    ).toBe("Gav upp (1 ifrån, 2 ledtrådar)");
  });

  test("nothing while playing", () => {
    expect(resultOutcome({ status: "playing", perfect: false, away: 3 })).toBeUndefined();
  });
});
