import { describe, expect, test } from "bun:test";
import { freePlayShareText } from "./shareText";

const link = "/fri?r=EAIFoKACI";
const standard = { kind: "standard" } as const;

describe("a free-play trip's share text", () => {
  test("a win shows the mode, the daily label plus the score, the emoji line and the trip link", () => {
    expect(
      freePlayShareText({
        mode: standard,
        outcome: { kind: "won", extra: 2, hintsUsed: 1 },
        score: 3,
        emojiLine: "🟩🟧✅✅🟥✅",
        link,
      }),
    ).toBe(
      "#åkle Fri resa · Standard\n+2 (1 ledtråd) · 3 poäng\n🟩🟧✅✅🟥✅\nhttps://akle.grehn.net/fri?r=EAIFoKACI",
    );
  });

  test("a Perfect win scores −1", () => {
    expect(
      freePlayShareText({
        mode: standard,
        outcome: { kind: "perfect", extra: 0 },
        score: -1,
        emojiLine: "✅✅",
        link,
      }),
    ).toBe(
      "#åkle Fri resa · Standard\n+0 (Perfekt) · −1 poäng\n✅✅\nhttps://akle.grehn.net" + link,
    );
  });

  test("a loss shows how far away it ended", () => {
    expect(
      freePlayShareText({
        mode: standard,
        outcome: { kind: "lost", away: 3, hintsUsed: 0 },
        score: 9,
        emojiLine: "🟥🟥🟧🟥🟥",
        link,
      }),
    ).toBe(
      "#åkle Fri resa · Standard\n(3 ifrån) · 9 poäng\n🟥🟥🟧🟥🟥\nhttps://akle.grehn.net" + link,
    );
  });

  test("labels a give-up beside the guess-limit loss", () => {
    expect(
      freePlayShareText({
        mode: standard,
        outcome: { kind: "lost", away: 3, hintsUsed: 0, givenUp: true },
        score: 11,
        emojiLine: "🟥🟧🟥",
        link,
      }),
    ).toBe(
      "#åkle Fri resa · Standard\nGav upp (3 ifrån) · 11 poäng\n🟥🟧🟥\nhttps://akle.grehn.net" +
        link,
    );
  });

  test("a tie-breaker win carries its time after the score", () => {
    expect(
      freePlayShareText({
        mode: { kind: "tie-breaker" },
        outcome: { kind: "won", extra: 1, hintsUsed: 0 },
        score: 2,
        time: 834,
        emojiLine: "✅🟧✅",
        link,
      }),
    ).toBe(
      "#åkle Fri resa · Tidtagning\n+1 · 2 poäng · 1:23,4\n✅🟧✅\nhttps://akle.grehn.net" + link,
    );
  });

  test("a tie-breaker loss has no time", () => {
    expect(
      freePlayShareText({
        mode: { kind: "tie-breaker" },
        outcome: { kind: "lost", away: 1, hintsUsed: 0, givenUp: true },
        score: 3,
        emojiLine: "🟧",
        link,
      }).split("\n")[1],
    ).toBe("Gav upp (1 ifrån) · 3 poäng");
  });

  test("names the mode, with a timed trip's thinking time", () => {
    const header = (mode: Parameters<typeof freePlayShareText>[0]["mode"]) =>
      freePlayShareText({
        mode,
        outcome: { kind: "won", extra: 0, hintsUsed: 0 },
        score: 0,
        emojiLine: "✅",
        link,
      }).split("\n")[0];
    expect(header({ kind: "unlimited" })).toBe("#åkle Fri resa · Obegränsad");
    expect(header({ kind: "timed", thinkingTime: 10 })).toBe("#åkle Fri resa · Tidspress 10 s");
    expect(header({ kind: "tie-breaker" })).toBe("#åkle Fri resa · Tidtagning");
  });

  test("keeps a long emoji line on one line and never carries a trip number", () => {
    const emojiLine = "🟥".repeat(40) + "✅";
    const text = freePlayShareText({
      mode: { kind: "unlimited" },
      outcome: { kind: "won", extra: 38, hintsUsed: 0 },
      score: 38,
      emojiLine,
      link,
    });
    expect(text.split("\n")).toHaveLength(4);
    expect(text.split("\n")[2]).toBe(emojiLine);
    expect(text).not.toMatch(/#\d/);
  });
});
