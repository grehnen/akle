import type { Clock } from "../engine/clock";
import type { Game } from "../engine/game";
import { elapsedTime } from "../engine/tripTime";
import { clockText } from "./messages";
import { useNow } from "./useNow";
import "./TripClock.css";

/**
 * The running `m:ss` clock of a trip whose time is kept, stopped at the win. It reads the time
 * from timestamps on each tick, so it is right again the moment the page is back after being
 * hidden or asleep. A timer, so it is visible but never announced live.
 */
export function TripClock({ game, clock }: { game: Game; clock: Clock }) {
  const now = useNow(clock, game.wonAt === undefined);
  return (
    <p className="trip-clock">
      <span className="visually-hidden">Tid </span>
      <span role="timer">{clockText(elapsedTime(game, now))}</span>
    </p>
  );
}
