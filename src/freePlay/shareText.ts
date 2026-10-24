import type { Outcome } from "../progress/outcome";
import { resultLabel } from "../progress/shareText";
import { SITE_URL } from "../siteUrl";
import { modeName, scoreText, timeText } from "../ui/messages";
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
 * What a player copies after a free-play trip: `#åkle Fri resa · <mode>`, the daily label plus
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
  const label = [resultLabel(outcome), scoreText(score)];
  if (time !== undefined) label.push(timeText(time));
  return [
    `#åkle Fri resa · ${modeName(mode)}`,
    label.join(" · "),
    emojiLine,
    `${SITE_URL}${link}`,
  ].join("\n");
}
