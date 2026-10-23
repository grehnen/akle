import { describe, expect, test } from "bun:test";
import { epochChangeViolation, playedThroughAtBase } from "./playedThrough";

const epoch = "2026-10-01";

describe("playedThroughAtBase", () => {
  const now = new Date("2026-10-21T10:00:00Z");

  test("is 0 when the base revision has no schedule", () => {
    expect(playedThroughAtBase(now, { epoch, rows: [] })).toBe(0);
  });

  test("is capped by the last puzzle the base revision scheduled", () => {
    expect(playedThroughAtBase(now, { epoch, rows: [{ number: 1 }, { number: 2 }] })).toBe(2);
  });

  test("is today's puzzle number in UTC+14 when the base scheduled past it", () => {
    const baseRows = Array.from({ length: 90 }, (_, index) => ({ number: index + 1 }));
    expect(playedThroughAtBase(now, { epoch, rows: baseRows })).toBe(22);
  });

  test("counts with the base revision's epoch, so moving it can't unplay puzzles", () => {
    const baseRows = Array.from({ length: 90 }, (_, index) => ({ number: index + 1 }));
    expect(playedThroughAtBase(now, { epoch: "2026-10-11", rows: baseRows })).toBe(12);
  });

  test("is 0 before anyone anywhere has reached the epoch", () => {
    const baseRows = Array.from({ length: 90 }, (_, index) => ({ number: index + 1 }));
    expect(playedThroughAtBase(new Date("2026-09-30T09:00:00Z"), { epoch, rows: baseRows })).toBe(
      0,
    );
  });
});

describe("epochChangeViolation", () => {
  test("allows an unchanged epoch, even after puzzles are played", () => {
    expect(epochChangeViolation({ baseEpoch: epoch, epoch, playedThrough: 22 })).toBeUndefined();
  });

  test("allows moving the epoch while the base has no played puzzle", () => {
    expect(
      epochChangeViolation({ baseEpoch: epoch, epoch: "2026-10-26", playedThrough: 0 }),
    ).toBeUndefined();
  });

  test("fails when the epoch moves once the base has a played puzzle", () => {
    expect(epochChangeViolation({ baseEpoch: epoch, epoch: "2026-10-26", playedThrough: 1 })).toBe(
      "The epoch changed from 2026-10-01 to 2026-10-26, but puzzles up to #1 are already played; it can't move after launch.",
    );
  });
});
