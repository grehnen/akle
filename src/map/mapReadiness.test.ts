import { describe, expect, test } from "bun:test";
import { mapReadiness, type ReadinessTimers } from "./mapReadiness";

/** A map that only emits `idle`, when the test says. */
function fakeMap() {
  let listeners: (() => void)[] = [];
  return {
    once(type: "idle", listener: () => void) {
      if (type === "idle") listeners.push(listener);
    },
    off(type: "idle", listener: () => void) {
      if (type === "idle") listeners = listeners.filter((other) => other !== listener);
    },
    idle() {
      const called = listeners;
      listeners = [];
      for (const listener of called) listener();
    },
  };
}

/** Timers the test moves on by hand. */
function fakeTimers() {
  let now = 0;
  let timers: { at: number; run: () => void; id: number }[] = [];
  let nextId = 1;
  const timersApi: ReadinessTimers = {
    setTimeout: (run, ms) => {
      const id = nextId++;
      timers.push({ at: now + ms, run, id });
      return id;
    },
    clearTimeout: (id) => {
      timers = timers.filter((timer) => timer.id !== id);
    },
  };
  const advance = (ms: number) => {
    now += ms;
    const due = timers.filter((timer) => timer.at <= now);
    timers = timers.filter((timer) => timer.at > now);
    for (const timer of due) timer.run();
  };
  return { timers: timersApi, advance };
}

function watch() {
  const { timers, advance } = fakeTimers();
  let readyCount = 0;
  const readiness = mapReadiness(() => readyCount++, { timers });
  return { readiness, advance, ready: () => readyCount };
}

describe("a map's readiness", () => {
  test("is the first idle after the shapes are in, reported once", () => {
    const { readiness, ready } = watch();
    const map = fakeMap();
    map.idle();
    expect(ready()).toBe(0);
    readiness.shapesIn(map);
    expect(ready()).toBe(0);
    map.idle();
    expect(ready()).toBe(1);
    map.idle();
    expect(ready()).toBe(1);
  });

  test("an idle before the shapes are in doesn't count", () => {
    const { readiness, ready } = watch();
    const map = fakeMap();
    map.idle();
    map.idle();
    expect(ready()).toBe(0);
    readiness.shapesIn(map);
    map.idle();
    expect(ready()).toBe(1);
  });

  test("comes after about 8 s at most, even with no idle", () => {
    const { readiness, advance, ready } = watch();
    readiness.shapesIn(fakeMap());
    advance(7999);
    expect(ready()).toBe(0);
    advance(1);
    expect(ready()).toBe(1);
  });

  test("counts its 8 s from the start, before the map is even made", () => {
    const { advance, ready } = watch();
    advance(8000);
    expect(ready()).toBe(1);
  });

  test("comes at once when no map can be made, and only once", () => {
    const { readiness, advance, ready } = watch();
    readiness.unavailable();
    expect(ready()).toBe(1);
    advance(8000);
    expect(ready()).toBe(1);
  });

  test("an idle after the cap reports nothing more", () => {
    const { readiness, advance, ready } = watch();
    const map = fakeMap();
    readiness.shapesIn(map);
    advance(8000);
    map.idle();
    expect(ready()).toBe(1);
  });

  test("is never reported once stopped, as when the map goes away", () => {
    const { readiness, advance, ready } = watch();
    const map = fakeMap();
    readiness.shapesIn(map);
    readiness.stop();
    map.idle();
    advance(8000);
    readiness.unavailable();
    expect(ready()).toBe(0);
  });
});
