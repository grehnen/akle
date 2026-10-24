import type { Outcome } from "../progress/outcome";
import { resultLabel } from "../progress/shareText";
import { SITE_URL } from "../siteUrl";
import { modeName, scoreText } from "../ui/messages";
import type { ModeSetting } from "./linkPayload";

/** A finished free-play trip as its share text needs it. */
export type FreePlayShareResult = {
  mode: ModeSetting;
  outcome: Outcome;
  score: number;
  /** One ✅/🟩/🟧/🟥 per counted guess, in guess order. */
  emojiLine: string;
  /** The trip's link, from the site root: `/fri?r=…`. */
  link: string;
};

/**
 * What a player copies after a free-play trip: `#åkle Fri resa · <mode>`, the daily label plus
 * the score, the emoji line on one line, and the trip's link. Never a trip number, so it can't
 * pass for a daily share text, and never the endpoints, which only the link carries, packed.
 */
export function freePlayShareText({
  mode,
  outcome,
  score,
  emojiLine,
  link,
}: FreePlayShareResult): string {
  return [
    `#åkle Fri resa · ${modeName(mode)}`,
    `${resultLabel(outcome)} · ${scoreText(score)}`,
    emojiLine,
    `${SITE_URL}${link}`,
  ].join("\n");
}
