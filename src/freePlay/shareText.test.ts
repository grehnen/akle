import { describe, expect, test } from "bun:test";
import type { ItinerarySummary, ItinerarySummaryRow } from "./itinerarySummary";
import { freePlayShareText, itineraryShareText } from "./shareText";

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

  test("a loss with hints keeps them in the away bracket, as the result headline does", () => {
    expect(
      freePlayShareText({
        mode: standard,
        outcome: { kind: "lost", away: 2, hintsUsed: 1 },
        score: 7,
        emojiLine: "🟥🟧",
        link,
      }).split("\n")[1],
    ).toBe("(2 ifrån, 1 ledtråd) · 7 poäng");
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

  test("a timed trip puts its timeouts inside the label's brackets, never in the emoji line", () => {
    const timed = { kind: "timed", thinkingTime: 10 } as const;
    expect(
      freePlayShareText({
        mode: timed,
        outcome: { kind: "won", extra: 2, hintsUsed: 1, timeouts: 2 },
        score: 5,
        emojiLine: "🟩🟧✅✅",
        link,
      }),
    ).toBe(
      "#åkle Fri resa · Tidspress 10 s\n+2 (1 ledtråd, 2 ⏱) · 5 poäng\n🟩🟧✅✅\nhttps://akle.grehn.net" +
        link,
    );
    const label = (outcome: Parameters<typeof freePlayShareText>[0]["outcome"]) =>
      freePlayShareText({ mode: timed, outcome, score: 0, emojiLine: "✅", link }).split("\n")[1];
    expect(label({ kind: "won", extra: 0, hintsUsed: 0, timeouts: 2 })).toBe("+0 (2 ⏱) · 0 poäng");
    expect(label({ kind: "lost", away: 3, hintsUsed: 0, timeouts: 1 })).toBe(
      "(3 ifrån, 1 ⏱) · 0 poäng",
    );
    expect(label({ kind: "lost", away: 1, hintsUsed: 2, timeouts: 3, givenUp: true })).toBe(
      "Gav upp (1 ifrån, 2 ledtrådar, 3 ⏱) · 0 poäng",
    );
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

describe("an itinerary's share text", () => {
  const itineraryLink = "/resplan?namn=Norrlandsturen&r=EIYFoKAAoAUMXhQwBgdq";
  const row = (fields: Partial<ItinerarySummaryRow>): ItinerarySummaryRow => ({
    mode: standard,
    start: "Kiruna",
    destination: "Umeå",
    outcome: { kind: "won", extra: 1, hintsUsed: 0 },
    hintsUsed: 0,
    timeouts: 0,
    score: 1,
    ...fields,
  });
  const rows: ItinerarySummaryRow[] = [
    row({}),
    row({
      mode: { kind: "timed", thinkingTime: 10 },
      outcome: { kind: "lost", away: 2, hintsUsed: 0, givenUp: true },
      score: 8,
    }),
    row({
      mode: { kind: "tie-breaker" },
      outcome: { kind: "won", extra: 0, hintsUsed: 1 },
      score: 1,
      time: 1234,
    }),
    row({
      mode: { kind: "tie-breaker" },
      outcome: { kind: "perfect", extra: 0 },
      score: -1,
      time: 1289,
    }),
    row({ mode: { kind: "tie-breaker" }, outcome: { kind: "lost", away: 1, hintsUsed: 1 } }),
  ];
  const summary = (
    summaryRows: ItinerarySummaryRow[],
    standing: ItinerarySummary["standing"],
  ): ItinerarySummary => ({
    rows: summaryRows,
    standing,
    hasTieBreaker: summaryRows.some((summaryRow) => summaryRow.mode.kind === "tie-breaker"),
  });

  test("has the title and count, the total with its time, a label row per trip and the link", () => {
    expect(
      itineraryShareText({
        title: "Norrlandsturen",
        summary: summary(rows, { score: 10, wonTieBreakers: 2, totalTime: 2523 }),
        link: itineraryLink,
      }),
    ).toBe(
      [
        "#åkle Resplan · Norrlandsturen · 5 resor",
        "Totalt 10 poäng · 4:12,3 (2 vunna)",
        "1. Standard · +1 · 1 poäng",
        "2. Tidspress 10 s · Gav upp (2 ifrån) · 8 poäng",
        "3. Tidtagning · +0 (1 ledtråd) · 1 poäng · 2:03,4",
        "4. Tidtagning · +0 (Perfekt) · −1 poäng · 2:08,9",
        "5. Tidtagning · (1 ifrån, 1 ledtråd) · 1 poäng",
        "https://akle.grehn.net/resplan?namn=Norrlandsturen&r=EIYFoKAAoAUMXhQwBgdq",
      ].join("\n"),
    );
  });

  test("without a title the header has only the count", () => {
    const text = itineraryShareText({
      summary: summary(rows.slice(0, 2), { score: 9, wonTieBreakers: 0, totalTime: 0 }),
      link: "/resplan?r=EIYFoKAAoAUMXhQwBgdq",
    });
    expect(text.split("\n")[0]).toBe("#åkle Resplan · 2 resor");
  });

  test("without a tie-breaker trip the total has no time", () => {
    const text = itineraryShareText({
      title: "Fredag",
      summary: summary(rows.slice(0, 2), { score: 9, wonTieBreakers: 0, totalTime: 0 }),
      link: itineraryLink,
    });
    expect(text.split("\n")[1]).toBe("Totalt 9 poäng");
  });

  test("with tie-breaker trips but none won the total still counts them", () => {
    const text = itineraryShareText({
      summary: summary([rows[0], rows[4]], { score: 2, wonTieBreakers: 0, totalTime: 0 }),
      link: itineraryLink,
    });
    expect(text.split("\n")[1]).toBe("Totalt 2 poäng · 0:00,0 (0 vunna)");
  });

  test("one won tie-breaker trip reads vunnen", () => {
    const text = itineraryShareText({
      summary: summary([rows[0], rows[2]], { score: 2, wonTieBreakers: 1, totalTime: 1234 }),
      link: itineraryLink,
    });
    expect(text.split("\n")[1]).toBe("Totalt 2 poäng · 2:03,4 (1 vunnen)");
  });

  test("never names the endpoints, has no emoji lines and never carries a trip number", () => {
    const text = itineraryShareText({
      title: "Norrlandsturen",
      summary: summary(rows, { score: 10, wonTieBreakers: 2, totalTime: 2523 }),
      link: itineraryLink,
    });
    expect(text).not.toContain("Kiruna");
    expect(text).not.toContain("Umeå");
    expect(text).not.toMatch(/[✅🟩🟧🟥]/u);
    expect(text).not.toMatch(/#\d/);
  });
});
