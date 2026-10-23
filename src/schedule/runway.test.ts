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
  test("fails the runway check below 40 days", () => {
    expect(runwayViolation(39)).toBe(
      "Only 39 days of puzzles left; the runway check needs at least 40. Run `bun run schedule` and merge the extension.",
    );
    expect(runwayViolation(0)).toBeDefined();
  });

  test("passes from 40 days", () => {
    expect(runwayViolation(40)).toBeUndefined();
    expect(runwayViolation(1000)).toBeUndefined();
  });
});

describe("extensionPlan", () => {
  test("does nothing from 90 days, even with an extension PR open", () => {
    expect(extensionPlan(90, undefined)).toEqual({ action: "none" });
    expect(extensionPlan(400, 12)).toEqual({ action: "none" });
  });

  test("below 90 days, opens an extension PR without auto-merge", () => {
    expect(extensionPlan(89, undefined)).toEqual({ action: "open", autoMerge: false });
    expect(extensionPlan(40, undefined)).toEqual({ action: "open", autoMerge: false });
  });

  test("updates its own open extension PR instead of opening a second", () => {
    expect(extensionPlan(60, 12)).toEqual({ action: "update", pullRequest: 12, autoMerge: false });
  });

  test("below 40 days, also turns on auto-merge", () => {
    expect(extensionPlan(39, undefined)).toEqual({ action: "open", autoMerge: true });
    expect(extensionPlan(5, 12)).toEqual({ action: "update", pullRequest: 12, autoMerge: true });
  });
});
