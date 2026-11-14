import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ItinerarySummaryRow } from "../freePlay/itinerarySummary";
import { ItinerarySummaryView } from "./ItinerarySummary";
import { LOST_TIE_BREAKER_TIME_EXPLANATION } from "./messages";

const timedRow = (timeouts: number): ItinerarySummaryRow => ({
  start: "Nynäshamn",
  destination: "Trosa",
  mode: { kind: "timed", thinkingTime: 10 },
  outcome: { kind: "won", extra: 1, hintsUsed: 0, timeouts },
  hintsUsed: 0,
  timeouts,
  score: 1 + timeouts,
});

/** Each timed row's timeouts as a screen reader hears them. */
function timeoutsHeard(...timeouts: number[]): string[] {
  const markup = renderToStaticMarkup(
    <ItinerarySummaryView
      summary={{
        rows: timeouts.map(timedRow),
        standing: { tripsWon: timeouts.length, score: 0, tieBreakerTime: 0 },
      }}
      link="/resplan?r=EIYFoKAAoAUMXhQwBgdq"
    />,
  );
  return [
    ...markup.matchAll(
      /class="itinerary-summary-outcome">.*?<span class="visually-hidden">(.*?)<\/span>/g,
    ),
  ].map((match) => match[1] ?? "");
}

describe("an itinerary's summary", () => {
  test("reads a timed trip's timeouts in words, one timeout without a count", () => {
    expect(timeoutsHeard(1, 3)).toEqual(["Tiden ute", "Tiden ute 3 gånger"]);
  });
});

const tieBreakerWon: ItinerarySummaryRow = {
  start: "Nynäshamn",
  destination: "Trosa",
  mode: { kind: "tie-breaker" },
  outcome: { kind: "perfect", extra: 0 },
  hintsUsed: 0,
  timeouts: 0,
  score: -1,
  time: 345,
};

const tieBreakerLost: ItinerarySummaryRow = {
  ...tieBreakerWon,
  outcome: { kind: "lost", away: 1, hintsUsed: 0, givenUp: true },
  score: 3,
  time: undefined,
};

const standardRow: ItinerarySummaryRow = {
  ...tieBreakerWon,
  mode: { kind: "standard" },
  time: undefined,
};

function summaryMarkup(rows: ItinerarySummaryRow[], tieBreakerTime: number): string {
  return renderToStaticMarkup(
    <ItinerarySummaryView
      summary={{ rows, standing: { tripsWon: 1, score: 2, tieBreakerTime } }}
      link="/resplan?r=EIYFoKAAoAUMXhQwBgdq"
    />,
  );
}

/** The time spans of a markup's rows, each with whether it is a tooltip trigger. */
function rowTimes(markup: string): { text: string; tooltip: boolean }[] {
  return [
    ...markup.matchAll(/<span class="itinerary-summary-time">(.*?)<\/span>(?=<\/p>|<span)/g),
  ].map((match) => ({
    text: (match[1] ?? "").replace(/<[^>]*>/g, ""),
    tooltip: (match[1] ?? "").includes("tooltip-trigger"),
  }));
}

describe("an itinerary's summary of tie-breaker trips", () => {
  test("a won Tidtagning row shows its time with no tooltip", () => {
    expect(rowTimes(summaryMarkup([tieBreakerWon, standardRow], 345))).toEqual([
      { text: "0:34,5", tooltip: false },
    ]);
  });

  test("a lost Tidtagning row shows 5:00,0 with a tooltip, explained in the tooltip's text", () => {
    const markup = summaryMarkup([tieBreakerLost, standardRow], 3000);
    expect(rowTimes(markup)).toEqual([{ text: "5:00,0", tooltip: true }]);
    expect(LOST_TIE_BREAKER_TIME_EXPLANATION).toBe(
      "En Tidtagnings-resa du inte vinner räknas som 5:00,0.",
    );
  });

  test("Total tid sums the won time and 5 minutes for each lost trip", () => {
    const markup = summaryMarkup([tieBreakerWon, tieBreakerLost], 345 + 3000);
    expect(markup).toMatch(/<dt>Total tid<\/dt><dd class="itinerary-summary-total">5:34,5<\/dd>/);
  });

  test("Total tid is left out without a Tidtagning trip", () => {
    expect(summaryMarkup([standardRow], 0)).not.toContain("Total tid");
  });

  test("there is no counts line", () => {
    const markup = summaryMarkup([tieBreakerLost, standardRow], 3000);
    expect(markup).not.toContain("itinerary-summary-counts");
    expect(markup).not.toContain("Gav upp 1");
  });
});
