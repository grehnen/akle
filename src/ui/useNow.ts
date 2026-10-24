import { useEffect, useState } from "react";
import type { Clock } from "../engine/clock";

const TICK_MS = 250;

/**
 * The time now, read from `clock` on every tick while `running` and whenever the page comes back
 * into view, so whatever is shown from timestamps is right again at once after the page was
 * hidden or asleep.
 */
export function useNow(clock: Clock, running: boolean): number {
  const [now, setNow] = useState(clock);
  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(clock());
    const timer = setInterval(tick, TICK_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [clock, running]);
  return now;
}
