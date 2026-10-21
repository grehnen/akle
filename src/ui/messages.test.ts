import { describe, expect, test } from "bun:test";
import { rejectionMessage, resultOutcome } from "./messages";

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
    expect(resultOutcome({ status: "won", extra: 0, perfect: true, away: 0 })).toEqual({
      headline: "Framme!",
      score: "Perfekt",
    });
  });

  test("a win with extra guesses", () => {
    expect(resultOutcome({ status: "won", extra: 2, perfect: false, away: 0 })?.score).toBe("+2");
    expect(resultOutcome({ status: "won", extra: 0, perfect: false, away: 0 })?.score).toBe("+0");
  });

  test("a loss counts the kommuner still missing", () => {
    expect(resultOutcome({ status: "lost", perfect: false, away: 3 })).toEqual({
      headline: "Slut på gissningar",
      score: "3 kvar",
    });
  });

  test("nothing while playing", () => {
    expect(resultOutcome({ status: "playing", perfect: false, away: 3 })).toBeUndefined();
  });
});
