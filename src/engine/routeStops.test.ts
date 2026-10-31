import { describe, expect, test } from "bun:test";
import { guessedStops } from "./routeStops";

const trip = { start: "A", destination: "D" };

describe("guessedStops", () => {
  test("gives the guesses on the route in route order, whatever order they were guessed in", () => {
    expect(guessedStops(trip, ["A", "B", "C", "D"], new Set(["C", "B"]))).toEqual(["B", "C"]);
  });

  test("leaves out the endpoints, even when the guesses somehow name them", () => {
    expect(guessedStops(trip, ["A", "B", "D"], new Set(["A", "B", "D"]))).toEqual(["B"]);
  });

  test("leaves out a guess off the route", () => {
    expect(guessedStops(trip, ["A", "B", "D"], new Set(["B", "X"]))).toEqual(["B"]);
  });

  test("leaves out a kommun on the route that wasn't guessed", () => {
    expect(guessedStops(trip, ["A", "B", "C", "D"], new Set(["C"]))).toEqual(["C"]);
  });

  test("gives nothing for a route with no kommun between its endpoints", () => {
    expect(guessedStops(trip, ["A", "D"], new Set())).toEqual([]);
  });
});
