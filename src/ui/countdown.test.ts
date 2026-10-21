import { describe, expect, test } from "bun:test";
import { countdownToMidnight } from "./countdown";

describe("countdownToMidnight", () => {
  test("counts hours, minutes and seconds to the next local midnight", () => {
    expect(countdownToMidnight(new Date(2026, 9, 21, 13, 5, 9))).toBe("10:54:51");
    expect(countdownToMidnight(new Date(2026, 9, 21, 23, 59, 30))).toBe("00:00:30");
  });

  test("shows a full day right at midnight", () => {
    expect(countdownToMidnight(new Date(2026, 9, 21, 0, 0, 0))).toBe("24:00:00");
  });

  test("rounds part of a second up, so it never shows zero before midnight", () => {
    expect(countdownToMidnight(new Date(2026, 9, 21, 23, 59, 59, 500))).toBe("00:00:01");
  });
});
