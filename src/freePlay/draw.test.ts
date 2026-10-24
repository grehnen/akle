import { describe, expect, test } from "bun:test";
import { pathCode, pathGraph } from "../schedule/testGraphs";
import { drawTrip, largestDistance, tripPairs } from "./draw";

/** A random source that returns the given values in turn, and fails if asked for more. */
function scripted(...values: number[]) {
  let calls = 0;
  const random = () => {
    if (calls >= values.length) throw new Error(`asked for random value #${calls + 1}`);
    return values[calls++];
  };
  return { random, calls: () => calls };
}

// k00 ─ k01 ─ k02 ─ k03 ─ k04 ─ k05: distance 1 has the four pairs k00–k02 … k03–k05, and
// distance 4 only k00–k05.
const path = tripPairs(pathGraph(6));

describe("drawing a trip", () => {
  test("takes the distance first, then the pair at that distance, then which end starts", () => {
    const source = scripted(0, 0.5, 0.2);
    expect(drawTrip(path, { min: 1, max: 4 }, source.random)).toEqual({
      start: pathCode(2),
      destination: pathCode(4),
    });
    expect(source.calls()).toBe(3);
  });

  test("the coin flip can make either end the start", () => {
    expect(drawTrip(path, { min: 1, max: 4 }, scripted(0, 0.5, 0.7).random)).toEqual({
      start: pathCode(4),
      destination: pathCode(2),
    });
  });

  test("each distance in the range is as likely, however few pairs it has", () => {
    // Distances 1–4 split [0, 1) in quarters; the last quarter is distance 4's lone pair.
    expect(drawTrip(path, { min: 1, max: 4 }, scripted(0.8, 0.9, 0).random)).toEqual({
      start: pathCode(0),
      destination: pathCode(5),
    });
  });

  test("a range of one distance draws only at that distance", () => {
    expect(drawTrip(path, { min: 3, max: 3 }, scripted(0.99, 0.99, 0.99).random)).toEqual({
      start: pathCode(5),
      destination: pathCode(1),
    });
  });

  test("never draws a trip whose ends are the same kommun or neighbors", () => {
    const graph = pathGraph(8);
    const pairs = tripPairs(graph);
    for (let draw = 0; draw < 200; draw++) {
      const values = [(draw % 7) / 7, ((draw * 13) % 29) / 29, (draw % 2) / 2];
      const trip = drawTrip(pairs, { min: 1, max: 6 }, scripted(...values).random);
      // Positions on the path: at least two apart means a kommun between the ends.
      const [start, destination] = [trip?.start, trip?.destination].map((code) =>
        Number(code?.slice(1)),
      );
      expect(Math.abs(start - destination)).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("drawing again after a trip", () => {
  // k00 ─ k01 ─ k02 ─ k03: distance 1 has k00–k02 and k01–k03, distance 2 only k00–k03.
  const short = tripPairs(pathGraph(4));
  const previous = { start: pathCode(2), destination: pathCode(0) };

  test.each([0, 0.99])("skips the previous pair, in either direction (pair value %p)", (value) => {
    const trip = drawTrip(short, { min: 1, max: 1 }, scripted(0, value, 0).random, previous);
    expect(trip).toEqual({ start: pathCode(1), destination: pathCode(3) });
  });

  test("skips a distance whose only pair is the previous one", () => {
    const lastTrip = { start: pathCode(0), destination: pathCode(3) };
    const trip = drawTrip(short, { min: 1, max: 2 }, scripted(0.99, 0, 0).random, lastTrip);
    expect(trip).toEqual({ start: pathCode(0), destination: pathCode(2) });
  });

  test("draws the previous pair again when no other pair is in range", () => {
    const lastTrip = { start: pathCode(3), destination: pathCode(0) };
    const trip = drawTrip(short, { min: 2, max: 2 }, scripted(0, 0, 0).random, lastTrip);
    expect(trip).toEqual({ start: pathCode(0), destination: pathCode(3) });
  });
});

describe("a graph version's trip pairs", () => {
  test("run from distance 1 up to its largest distance", () => {
    const pairs = tripPairs(pathGraph(6));
    expect([...pairs.keys()].sort()).toEqual([1, 2, 3, 4]);
    expect(largestDistance(pairs)).toBe(4);
  });

  test("a range beyond them draws nothing", () => {
    expect(drawTrip(path, { min: 5, max: 8 }, scripted(0, 0, 0).random)).toBeUndefined();
  });
});
