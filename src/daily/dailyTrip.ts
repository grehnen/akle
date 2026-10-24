import type { Trip } from "../engine/game";

/** A trip from the schedule: a trip plus its trip number, which a free-play trip doesn't have. */
export type DailyTrip = Trip & {
  number: number;
};
