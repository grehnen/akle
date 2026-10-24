import { describe, expect, test } from "bun:test";
import { buildGraphVersion } from "../graph/graphVersion";
import { endpointSuggestions, pickedTrip, resolveEndpoint } from "./endpoints";

// Nynäshamn ── Haninge ── Salem ── Trosa, and Habo on its own.
const graph = buildGraphVersion({
  id: "test",
  startsAtTrip: 1,
  kommuner: [
    { code: "0192", name: "Nynäshamn" },
    { code: "0136", name: "Haninge" },
    { code: "0128", name: "Salem" },
    { code: "0488", name: "Trosa" },
    { code: "0643", name: "Habo" },
  ],
  links: [
    { between: ["0192", "0136"], kind: "land" },
    { between: ["0136", "0128"], kind: "land" },
    { between: ["0128", "0488"], kind: "land" },
  ],
});

describe("resolving a Start or Mål field", () => {
  test.each([
    ["Haninge", "0136"],
    ["  haninge ", "0136"],
    ["nynashamn", "0192"],
    ["0136", "0136"],
    [" 0488", "0488"],
  ])("%p is %p", (input, code) => {
    expect(resolveEndpoint(graph, input)).toBe(code);
  });

  test.each(["", "Han", "9999", "136"])("%p is no kommun", (input) => {
    expect(resolveEndpoint(graph, input)).toBeUndefined();
  });
});

describe("a field's suggestions", () => {
  test("disable the other end as samma and its neighbors as granne", () => {
    const suggestions = endpointSuggestions(graph, "a", "0136");
    const tags = Object.fromEntries(suggestions.map((s) => [s.name, s.disabled]));
    expect(tags).toEqual({
      Haninge: "samma",
      Nynäshamn: "granne",
      Salem: "granne",
      Trosa: undefined,
      Habo: undefined,
    });
  });

  test("leave every kommun open while the other end is empty", () => {
    expect(endpointSuggestions(graph, "Haninge").map((s) => [s.name, s.disabled])).toEqual([
      ["Haninge", undefined],
    ]);
  });

  test("offer the kommun a typed SCB code names", () => {
    expect(endpointSuggestions(graph, "0488").map((s) => s.name)).toEqual(["Trosa"]);
  });
});

describe("a picked trip", () => {
  test("has its distance once both ends are a valid pair", () => {
    expect(pickedTrip(graph, "0192", "0488")).toEqual({
      trip: { start: "0192", destination: "0488" },
      distance: 2,
    });
  });

  test.each([
    ["no Mål yet", "0192", undefined],
    ["no Start yet", undefined, "0488"],
    ["the same kommun", "0136", "0136"],
    ["neighbors", "0136", "0128"],
    ["no route between them", "0192", "0643"],
  ])("is not made from %s", (_, start, destination) => {
    expect(pickedTrip(graph, start, destination)).toBeUndefined();
  });
});
