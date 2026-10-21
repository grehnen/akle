import { describe, expect, test } from "bun:test";
import { buildGraphVersion } from "./graphVersion";
import { preferredShortestRoute, shortestRouteLength, shortestRouteLengthsFrom } from "./routes";

// A ── B ── C ── D, with ferry-only dead end F linking A and D.
const graph = buildGraphVersion({
  id: "test",
  startsAtPuzzle: 1,
  kommuner: [
    { code: "A", name: "Alfa" },
    { code: "B", name: "Beta" },
    { code: "C", name: "Gamma" },
    { code: "D", name: "Delta" },
    { code: "F", name: "Färja" },
  ],
  links: [
    { between: ["A", "B"], kind: "land" },
    { between: ["B", "C"], kind: "land" },
    { between: ["C", "D"], kind: "fixed" },
    { between: ["A", "F"], kind: "ferry" },
    { between: ["D", "F"], kind: "ferry" },
  ],
});

describe("shortestRouteLength", () => {
  test("counts the intermediate kommuner on the shortest route", () => {
    expect(shortestRouteLength(graph, "A", "C")).toBe(1);
    expect(shortestRouteLength(graph, "A", "B")).toBe(0);
  });

  test("goes around a dead end instead of through it", () => {
    expect(shortestRouteLength(graph, "A", "D")).toBe(2);
  });

  test("lets a route start or end at a dead end", () => {
    expect(shortestRouteLength(graph, "F", "C")).toBe(1);
    expect(shortestRouteLength(graph, "B", "F")).toBe(1);
  });
});

describe("shortestRouteLengthsFrom", () => {
  test("gives N to every reachable kommun, never passing through a dead end", () => {
    expect(Object.fromEntries(shortestRouteLengthsFrom(graph, "A"))).toEqual({
      B: 0,
      C: 1,
      D: 2,
      F: 0,
    });
  });

  test("lets a route start at a dead end", () => {
    expect(Object.fromEntries(shortestRouteLengthsFrom(graph, "F"))).toEqual({
      A: 0,
      B: 1,
      C: 1,
      D: 0,
    });
  });
});

/*
 * Shortest routes from S to T (two kommuner between):
 *   S ── A ── C ── T
 *   S ── B ── C ── T
 *   S ── B ── D ── T
 * A longer route S ── L ── M ── N ── T, and ferry-only dead ends: X linking S and T,
 * and 0 linking S and C (as long as a shortest route, and first by code).
 */
const tieGraph = buildGraphVersion({
  id: "ties",
  startsAtPuzzle: 1,
  kommuner: ["S", "A", "B", "C", "D", "T", "L", "M", "N", "X", "Y", "0"].map((code) => ({
    code,
    name: code,
  })),
  links: [
    { between: ["S", "A"], kind: "land" },
    { between: ["S", "B"], kind: "land" },
    { between: ["A", "C"], kind: "land" },
    { between: ["B", "C"], kind: "land" },
    { between: ["B", "D"], kind: "land" },
    { between: ["C", "T"], kind: "land" },
    { between: ["D", "T"], kind: "land" },
    { between: ["S", "L"], kind: "land" },
    { between: ["L", "M"], kind: "land" },
    { between: ["M", "N"], kind: "land" },
    { between: ["N", "T"], kind: "land" },
    { between: ["S", "X"], kind: "ferry" },
    { between: ["X", "T"], kind: "ferry" },
    { between: ["S", "0"], kind: "ferry" },
    { between: ["0", "C"], kind: "ferry" },
  ],
});

describe("preferredShortestRoute", () => {
  const route = (...guesses: string[]) =>
    preferredShortestRoute(tieGraph, "S", "T", new Set(guesses));

  test("without guesses, takes the route that comes first by kommun code", () => {
    expect(route()).toEqual(["S", "A", "C", "T"]);
  });

  test("takes the shortest route containing the most guesses", () => {
    expect(route("D")).toEqual(["S", "B", "D", "T"]);
    expect(route("A", "B", "D")).toEqual(["S", "B", "D", "T"]);
  });

  test("breaks a tie in guesses by kommun code, in route order", () => {
    expect(route("B")).toEqual(["S", "B", "C", "T"]);
    expect(route("C", "D")).toEqual(["S", "A", "C", "T"]);
  });

  test("never takes a longer route, however many guesses it contains", () => {
    expect(route("L", "M", "N", "D")).toEqual(["S", "B", "D", "T"]);
  });

  test("never passes through a dead end", () => {
    expect(route("X")).toEqual(["S", "A", "C", "T"]);
    expect(route("0", "C")).toEqual(["S", "A", "C", "T"]);
  });

  test("lets a route start or end at a dead end", () => {
    expect(preferredShortestRoute(tieGraph, "X", "C", new Set())).toEqual(["X", "T", "C"]);
    expect(preferredShortestRoute(tieGraph, "C", "X", new Set())).toEqual(["C", "T", "X"]);
  });

  test("is undefined when no route exists", () => {
    expect(preferredShortestRoute(tieGraph, "S", "Y", new Set())).toBeUndefined();
  });
});
