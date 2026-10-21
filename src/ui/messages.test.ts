import { describe, expect, test } from "bun:test";
import { outcomeMessage, rejectionMessage } from "./messages";

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

describe("outcomeMessage", () => {
  test("a Perfect win", () => {
    expect(outcomeMessage({ status: "won", extra: 0, perfect: true, away: 0 }, [])).toBe(
      "Framme! Perfekt",
    );
  });

  test("a win with extra guesses", () => {
    expect(outcomeMessage({ status: "won", extra: 2, perfect: false, away: 0 }, [])).toBe(
      "Framme! +2",
    );
    expect(outcomeMessage({ status: "won", extra: 0, perfect: false, away: 0 }, [])).toBe(
      "Framme! +0",
    );
  });

  test("a loss names the missing kommuner", () => {
    expect(outcomeMessage({ status: "lost", perfect: false, away: 2 }, ["Botkyrka", "Salem"])).toBe(
      "Slut på gissningar. 2 kvar: Botkyrka, Salem",
    );
  });

  test("nothing while playing", () => {
    expect(outcomeMessage({ status: "playing", perfect: false, away: 3 }, [])).toBeUndefined();
  });
});
