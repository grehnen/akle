import { describe, expect, test } from "bun:test";
import { shareText } from "./shareText";

describe("the share text", () => {
  test("a win shows +extra and the emoji line, then the site", () => {
    expect(
      shareText({
        puzzleNumber: 12,
        won: true,
        extra: 2,
        perfect: false,
        away: 0,
        hintsUsed: 0,
        emojiLine: "🟧✅🟥✅",
      }),
    ).toBe("#åkle #12 +2\n🟧✅🟥✅\nhttps://akle.grehn.net");
  });

  test("a Perfect win shows +0 (Perfekt)", () => {
    expect(
      shareText({
        puzzleNumber: 3,
        won: true,
        extra: 0,
        perfect: true,
        away: 0,
        hintsUsed: 0,
        emojiLine: "✅✅✅",
      }),
    ).toBe("#åkle #3 +0 (Perfekt)\n✅✅✅\nhttps://akle.grehn.net");
  });

  test("a loss shows how many kommuner were still missing", () => {
    expect(
      shareText({
        puzzleNumber: 40,
        won: false,
        extra: null,
        perfect: false,
        away: 3,
        hintsUsed: 0,
        emojiLine: "🟧🟥🟥🟥🟥",
      }),
    ).toBe("#åkle #40 (3 kvar)\n🟧🟥🟥🟥🟥\nhttps://akle.grehn.net");
  });

  test("a win with hints shows them where (Perfekt) would go", () => {
    const won = { puzzleNumber: 5, won: true, extra: 0, perfect: false, away: 0 };
    expect(shareText({ ...won, hintsUsed: 1, emojiLine: "✅✅" })).toBe(
      "#åkle #5 +0 (1 ledtråd)\n✅✅\nhttps://akle.grehn.net",
    );
    expect(shareText({ ...won, extra: 1, hintsUsed: 3, emojiLine: "🟥✅✅" })).toBe(
      "#åkle #5 +1 (3 ledtrådar)\n🟥✅✅\nhttps://akle.grehn.net",
    );
  });

  test("a loss with hints shows them after the kommuner still missing", () => {
    const lost = { puzzleNumber: 40, won: false, extra: null, perfect: false, away: 2 };
    expect(shareText({ ...lost, hintsUsed: 1, emojiLine: "🟥🟥" })).toBe(
      "#åkle #40 (2 kvar) (1 ledtråd)\n🟥🟥\nhttps://akle.grehn.net",
    );
    expect(shareText({ ...lost, hintsUsed: 2, emojiLine: "🟥🟥" })).toBe(
      "#åkle #40 (2 kvar) (2 ledtrådar)\n🟥🟥\nhttps://akle.grehn.net",
    );
  });
});
