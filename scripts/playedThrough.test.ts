import { describe, expect, test } from "bun:test";
import { playedThroughAtBase } from "./playedThrough";

const epoch = "2026-10-01";

describe("playedThroughAtBase", () => {
  const now = new Date("2026-10-21T10:00:00Z");

  test("is 0 when the base revision has no schedule", () => {
    expect(playedThroughAtBase(now, epoch, [])).toBe(0);
  });

  test("is capped by the last puzzle the base revision scheduled", () => {
    expect(playedThroughAtBase(now, epoch, [{ number: 1 }, { number: 2 }])).toBe(2);
  });

  test("is today's puzzle number in UTC+14 when the base scheduled past it", () => {
    const baseRows = Array.from({ length: 90 }, (_, index) => ({ number: index + 1 }));
    expect(playedThroughAtBase(now, epoch, baseRows)).toBe(22);
  });

  test("is 0 before anyone anywhere has reached the epoch", () => {
    const baseRows = Array.from({ length: 90 }, (_, index) => ({ number: index + 1 }));
    expect(playedThroughAtBase(new Date("2026-09-30T09:00:00Z"), epoch, baseRows)).toBe(0);
  });
});
