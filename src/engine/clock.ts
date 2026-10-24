/**
 * The time now, as a timestamp in milliseconds. Times are measured between such timestamps,
 * never by counting ticks, so they keep running while the page is hidden, asleep or closed.
 * Injected so tests can move time.
 */
export type Clock = () => number;

export const systemClock: Clock = () => Date.now();
