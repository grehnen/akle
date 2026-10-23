import { describe, expect, test } from "bun:test";
import { extensionPlan, runwayDays, runwayViolation } from "./runway";

const epoch = "2026-10-01";
const scheduledThrough = (last: number) =>
  Array.from({ length: last }, (_, index) => ({ number: index + 1 }));

describe("runwayDays", () => {
  test("counts the scheduled puzzles after today's puzzle number in UTC+14", () => {
    // 12:00 UTC on 23 October is already 24 October in UTC+14: puzzle #24.
    expect(runwayDays(scheduledThrough(90), new Date("2026-10-23T12:00:00Z"), epoch)).toBe(66);
    // 09:00 UTC is still 23 October in UTC+14: puzzle #23.
    expect(runwayDays(scheduledThrough(90), new Date("2026-10-23T09:00:00Z"), epoch)).toBe(67);
  });

  test("before launch, every scheduled puzzle is runway", () => {
    expect(runwayDays(scheduledThrough(90), new Date("2026-09-01T00:00:00Z"), epoch)).toBe(90);
  });

  test("is 0 once the schedule has run out, and with no schedule", () => {
    expect(runwayDays(scheduledThrough(90), new Date("2027-06-01T00:00:00Z"), epoch)).toBe(0);
    expect(runwayDays([], new Date("2026-10-23T09:00:00Z"), epoch)).toBe(0);
  });
});

describe("runwayViolation", () => {
  test("fails the runway check below 100 days", () => {
    expect(runwayViolation(99)).toBe(
      "Only 99 days of puzzles left; the runway check needs at least 100. Run `bun run schedule` and merge the extension.",
    );
    expect(runwayViolation(0)).toBeDefined();
  });

  test("passes from 100 days", () => {
    expect(runwayViolation(100)).toBeUndefined();
    expect(runwayViolation(1000)).toBeUndefined();
  });
});

describe("extensionPlan", () => {
  const own = (number: number) => ({ number, handEdited: false });

  test("does nothing from 730 days, even with an extension PR open", () => {
    expect(extensionPlan(730, undefined)).toEqual({ action: "none" });
    expect(extensionPlan(4000, own(12))).toEqual({ action: "none" });
  });

  test("below 730 days, opens an extension PR without auto-merge", () => {
    expect(extensionPlan(729, undefined)).toEqual({ action: "open", autoMerge: false });
    expect(extensionPlan(365, undefined)).toEqual({ action: "open", autoMerge: false });
  });

  test("updates its own open extension PR instead of opening a second", () => {
    expect(extensionPlan(500, own(12))).toEqual({
      action: "update",
      pullRequest: 12,
      autoMerge: false,
    });
  });

  test("below 365 days, also turns on auto-merge", () => {
    expect(extensionPlan(364, undefined)).toEqual({ action: "open", autoMerge: true });
    expect(extensionPlan(5, own(12))).toEqual({
      action: "update",
      pullRequest: 12,
      autoMerge: true,
    });
  });

  test("leaves a hand-edited extension PR alone and only comments on it", () => {
    const handEdited = { number: 12, handEdited: true };
    expect(extensionPlan(500, handEdited)).toEqual({
      action: "comment",
      pullRequest: 12,
      autoMerge: false,
    });
    expect(extensionPlan(364, handEdited)).toEqual({
      action: "comment",
      pullRequest: 12,
      autoMerge: true,
    });
    expect(extensionPlan(730, handEdited)).toEqual({ action: "none" });
  });
});
