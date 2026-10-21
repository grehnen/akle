import { describe, expect, test } from "bun:test";
import { guessLimit } from "./guessLimit";

describe("guessLimit", () => {
  test.each([
    [0, 4],
    [1, 5],
    [3, 7],
    [4, 9],
    [6, 11],
    [7, 13],
    [9, 15],
    [10, 17],
    [12, 19],
    [13, 21],
    [20, 28],
  ])("N = %d allows %d guesses", (n, limit) => {
    expect(guessLimit(n)).toBe(limit);
  });
});
