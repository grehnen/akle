/** How long a map may take to be drawn before it counts as ready anyway. */
export const READY_CAP_MS = 8000;

export type ReadinessTimers = {
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (id: never) => void;
};

/** The one map event readiness waits on. */
type IdleSource = {
  once: (type: "idle", listener: () => void) => unknown;
  off: (type: "idle", listener: () => void) => unknown;
};

export type MapReadiness = {
  /** The kommun shapes are in `map`: its next idle is the map drawn, satellite and endpoints. */
  shapesIn: (map: IdleSource) => void;
  /** No map can be made, as without WebGL: ready at once, so the game still plays. */
  unavailable: () => void;
  /** The map is gone; nothing is reported after this. */
  stop: () => void;
};

/**
 * Watches one map until it is drawn, then reports it once: the first idle after the kommun
 * shapes are in, or after {@link READY_CAP_MS} from the start at most, or at once when no map can
 * be made.
 */
export function mapReadiness(
  onReady: () => void,
  { capMs = READY_CAP_MS, timers = globalThis as ReadinessTimers } = {},
): MapReadiness {
  let done = false;
  let watched: IdleSource | undefined;
  const finish = () => {
    if (done) return;
    done = true;
    timers.clearTimeout(cap as never);
    watched?.off("idle", ready);
  };
  const ready = () => {
    if (done) return;
    finish();
    onReady();
  };
  const cap = timers.setTimeout(ready, capMs);
  return {
    shapesIn: (map) => {
      if (done) return;
      watched?.off("idle", ready);
      watched = map;
      map.once("idle", ready);
    },
    unavailable: ready,
    stop: finish,
  };
}
