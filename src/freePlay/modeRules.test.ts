import { describe, expect, test } from "bun:test";
import { freePlayRules, opensAtStarta } from "./modeRules";

describe("a free-play mode's rules", () => {
  test("every mode lets the player give up, which a daily trip never does", () => {
    expect(freePlayRules({ kind: "standard" })).toEqual({
      guessLimit: "distance",
      giveUp: true,
      keepsTime: false,
    });
    expect(freePlayRules({ kind: "timed", thinkingTime: 10 }).giveUp).toBe(true);
    expect(freePlayRules({ kind: "tie-breaker" }).giveUp).toBe(true);
  });

  test("unlimited has no guess limit", () => {
    expect(freePlayRules({ kind: "unlimited" })).toEqual({
      guessLimit: "none",
      giveUp: true,
      keepsTime: false,
    });
  });

  test("tie-breaker keeps time, with the standard guess limit", () => {
    expect(freePlayRules({ kind: "tie-breaker" })).toEqual({
      guessLimit: "distance",
      giveUp: true,
      keepsTime: true,
    });
  });

  test("the modes on the clock open behind Starta", () => {
    expect(opensAtStarta({ kind: "tie-breaker" })).toBe(true);
    expect(opensAtStarta({ kind: "timed", thinkingTime: 10 })).toBe(true);
    expect(opensAtStarta({ kind: "standard" })).toBe(false);
    expect(opensAtStarta({ kind: "unlimited" })).toBe(false);
  });
});
