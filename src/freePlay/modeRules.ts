import type { Rules } from "../engine/game";
import type { ModeSetting } from "./linkPayload";

/**
 * The rules a free-play trip is played under in its mode. Every mode lets the player give up,
 * unlike a daily trip; unlimited has no guess limit, so a give-up is its only loss; tie-breaker
 * keeps a win's time; timed gives every guess its thinking time.
 */
export function freePlayRules(mode: ModeSetting): Rules {
  return {
    guessLimit: mode.kind === "unlimited" ? "none" : "distance",
    giveUp: true,
    keepsTime: mode.kind === "tie-breaker",
    ...(mode.kind === "timed" && { thinkingTime: mode.thinkingTime }),
  };
}

/**
 * Whether a trip in this mode opens hidden behind `Starta`, which shows its ends and starts its
 * clock: the modes played against real time, timed and tie-breaker.
 */
export function opensAtStarta(mode: ModeSetting): boolean {
  return mode.kind === "timed" || mode.kind === "tie-breaker";
}

/** The thinking time, in whole seconds, a timed trip gets unless the player sets another. */
export const DEFAULT_THINKING_TIME = 10;
