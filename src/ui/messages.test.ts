import { describe, expect, test } from "bun:test";
import {
  clockText,
  freePlayHeadline,
  rejectionMessage,
  resultOutcome,
  scoreText,
  timeText,
} from "./messages";

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

  test("timeouts are counted beside the hints", () => {
    expect(
      resultOutcome({
        status: "won",
        extra: 1,
        perfect: false,
        away: 0,
        hintsUsed: 1,
        timeouts: 2,
      }),
    ).toBe("Framme! (+1, 1 ledtråd, 2 ⏱)");
    expect(resultOutcome({ status: "won", extra: 0, perfect: false, away: 0, timeouts: 1 })).toBe(
      "Framme! (+0, 1 ⏱)",
    );
    expect(
      resultOutcome({ status: "lost", perfect: false, away: 2, givenUp: true, timeouts: 4 }),
    ).toBe("Gav upp (2 ifrån, 4 ⏱)");
  });

  test("nothing while playing", () => {
    expect(resultOutcome({ status: "playing", perfect: false, away: 3 })).toBeUndefined();
  });
});

describe("freePlayHeadline, leaving the costs to the score line", () => {
  test.each([
    [{ kind: "perfect", extra: 0 }, "Perfekt!"],
    [{ kind: "won", extra: 2, hintsUsed: 1, timeouts: 0 }, "Framme!"],
    [{ kind: "lost", away: 3, hintsUsed: 1, timeouts: 2 }, "Slut på gissningar"],
    [{ kind: "lost", away: 1, hintsUsed: 0, timeouts: 0, givenUp: true }, "Gav upp"],
  ] as const)("%o → %p", (outcome, headline) => {
    expect(freePlayHeadline(outcome)).toBe(headline);
  });
});

describe("clockText, the running clock in whole seconds", () => {
  test.each([
    [0, "0:00"],
    [9_999, "0:09"],
    [83_900, "1:23"],
    [3_599_999, "59:59"],
    [3_600_000, "1:00:00"],
    [3_725_000, "1:02:05"],
  ])("%p ms → %p", (milliseconds, text) => {
    expect(clockText(milliseconds)).toBe(text);
  });
});

describe("timeText, a win's time to tenths", () => {
  test.each([
    [0, "0:00,0"],
    [834, "1:23,4"],
    [35_999, "59:59,9"],
    [36_000, "1:00:00,0"],
    [72_012, "2:00:01,2"],
  ])("%p tenths → %p", (tenths, text) => {
    expect(timeText(tenths)).toBe(text);
  });
});
