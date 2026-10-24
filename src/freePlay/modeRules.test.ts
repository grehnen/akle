import { describe, expect, test } from "bun:test";
import { freePlayRules } from "./modeRules";

describe("a free-play mode's rules", () => {
  test("every mode lets the player give up, which a daily trip never does", () => {
    expect(freePlayRules({ kind: "standard" })).toEqual({ guessLimit: "distance", giveUp: true });
    expect(freePlayRules({ kind: "timed", thinkingTime: 10 }).giveUp).toBe(true);
    expect(freePlayRules({ kind: "tie-breaker" }).giveUp).toBe(true);
  });

  test("unlimited has no guess limit", () => {
    expect(freePlayRules({ kind: "unlimited" })).toEqual({ guessLimit: "none", giveUp: true });
  });
});
