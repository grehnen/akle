import { createContext } from "react";

/** How long the UI waits between things it shows over time; tests make these short. */
export type Pacing = {
  /** How long a game won just now keeps the board up before its result view opens. */
  winLingerMs: number;
  /** How long a game lost just now keeps the board up before its result view opens. */
  lossLingerMs: number;
  /** How often a running display, such as a trip's time or the thinking time, reads the clock. */
  tickMs: number;
};

export const DEFAULT_PACING: Pacing = { winLingerMs: 2500, lossLingerMs: 1500, tickMs: 250 };

export const PacingContext = createContext<Pacing>(DEFAULT_PACING);
