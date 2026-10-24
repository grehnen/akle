import { createContext } from "react";

/** How long the UI waits between things it shows over time; tests make these short. */
export type Pacing = {
  /** How long a game finished just now keeps the board up before its result view opens. */
  finishLingerMs: number;
  /** How often a running display, such as a trip's time or the thinking time, reads the clock. */
  tickMs: number;
};

export const DEFAULT_PACING: Pacing = { finishLingerMs: 1500, tickMs: 250 };

export const PacingContext = createContext<Pacing>(DEFAULT_PACING);
