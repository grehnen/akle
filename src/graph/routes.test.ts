import { describe, expect, test } from "bun:test";
import { buildGraphVersion } from "./graphVersion";
import { shortestRouteLength } from "./routes";

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
