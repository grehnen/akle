import { useContext, useEffect, useState } from "react";
import type { Clock } from "../engine/clock";
import { PacingContext } from "./pacing";

/**
 * The time now, read from `clock` on every tick while `running` and whenever the page comes back
 * into view, so whatever is shown from timestamps is right again at once after the page was
 * hidden or asleep.
 */
export function useNow(clock: Clock, running: boolean): number {
  const { tickMs } = useContext(PacingContext);
  const [now, setNow] = useState(clock);
  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(clock());
    const timer = setInterval(tick, tickMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [clock, running, tickMs]);
  return now;
}
