import type { Outcome } from "../progress/outcome";
import { resultLabel } from "../progress/shareText";
import { SITE_URL } from "../siteUrl";
import { modeName, costsSuffix, scoreText, timeText, totalTimeText } from "../ui/messages";
import type { ItinerarySummary } from "./itinerarySummary";
import type { ModeSetting } from "./linkPayload";

/** A finished free-play trip as its share text needs it. */
export type FreePlayShareResult = {
  mode: ModeSetting;
  outcome: Outcome;
  score: number;
  /** A tie-breaker win's time in tenths of a second; nothing else has one. */
  time?: number;
  /** One ✅/🟩/🟧/🟥 per counted guess, in guess order. */
  emojiLine: string;
  /** The trip's link, from the site root: `/fri?r=…`. */
  link: string;
};

/**
 * What a player copies after a free-play trip: `#åkle Fri resa · <mode>`, how it went plus
 * the score (and a tie-breaker win's time), the emoji line on one line, and the trip's link.
 * Never a trip number, so it can't pass for a daily share text, and never the endpoints, which
 * only the link carries, packed.
 */
export function freePlayShareText({
  mode,
  outcome,
  score,
  time,
  emojiLine,
  link,
}: FreePlayShareResult): string {
  return [
    `#åkle Fri resa · ${modeName(mode)}`,
    tripLabel({ outcome, score, time }),
    emojiLine,
    `${SITE_URL}${link}`,
  ].join("\n");
}

/** A finished free-play trip's label: how it went, the score and a tie-breaker win's time. */
function tripLabel({
  outcome,
  score,
  time,
}: Pick<FreePlayShareResult, "outcome" | "score" | "time">): string {
  const label = [outcomeLabel(outcome), scoreText(score)];
  if (time !== undefined) label.push(timeText(time));
  return label.join(" · ");
}

/**
 * A win reads as in the daily label; a loss keeps its hints and timeouts in one bracket with the
 * away, as the result headline does: `(2 ifrån, 1 ledtråd)`, `Gav upp (1 ifrån, 2 ⏱)`.
 */
function outcomeLabel(outcome: Outcome): string {
  if (outcome.kind !== "lost") return resultLabel(outcome);
  const away = `${outcome.away} ifrån${costsSuffix(outcome.hintsUsed, outcome.timeouts)}`;
  return `${outcome.givenUp ? "Gav upp " : ""}(${away})`;
}

/**
 * What a player copies from a finished itinerary's summary: `#åkle Resplan · <title> · <n>
 * resor`, the total score (with the total time and how many tie-breaker trips were won, when it
 * has any), a `<i>. <mode> · <trip label>` row per trip and the itinerary's link. No emoji lines,
 * and never the endpoints.
 */
export function itineraryShareText({
  title,
  summary,
  link,
}: {
  title?: string;
  summary: ItinerarySummary;
  /** The itinerary's link, from the site root: `/resplan?namn=…&r=…`. */
  link: string;
}): string {
  const { rows, standing, hasTieBreaker } = summary;
  const header = ["#åkle Resplan", ...(title === undefined ? [] : [title]), `${rows.length} resor`];
  const total = [`Totalt ${scoreText(standing.score)}`];
  if (hasTieBreaker) total.push(totalTimeText(standing.totalTime, standing.wonTieBreakers));
  return [
    header.join(" · "),
    total.join(" · "),
    ...rows.map((row, index) => `${index + 1}. ${modeName(row.mode)} · ${tripLabel(row)}`),
    `${SITE_URL}${link}`,
  ].join("\n");
}
