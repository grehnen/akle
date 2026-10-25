import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ItinerarySummaryRow } from "../freePlay/itinerarySummary";
import { ItinerarySummaryView } from "./ItinerarySummary";

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
        standing: { score: 0, wonTieBreakers: 0, totalTime: 0 },
        hasTieBreaker: false,
      }}
      link="/resplan?r=EIYFoKAAoAUMXhQwBgdq"
    />,
  );
  return [
    ...markup.matchAll(
      /class="itinerary-summary-timeouts">.*?<span class="visually-hidden">(.*?)<\/span>/g,
    ),
  ].map((match) => match[1] ?? "");
}

describe("an itinerary's summary", () => {
  test("reads a timed trip's timeouts in words, one timeout without a count", () => {
    expect(timeoutsHeard(1, 3)).toEqual(["Tiden ute", "Tiden ute 3 gånger"]);
  });
});
