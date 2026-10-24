import type { Rules } from "../engine/game";
import type { ModeSetting } from "./linkPayload";

/**
 * The rules a free-play trip is played under in its mode. Every mode lets the player give up,
 * unlike a daily trip; unlimited has no guess limit, so a give-up is its only loss.
 */
export function freePlayRules(mode: ModeSetting): Rules {
  return { guessLimit: mode.kind === "unlimited" ? "none" : "distance", giveUp: true };
}
