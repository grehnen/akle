import { describe, expect, test } from "bun:test";
import { type MapFraming, refitFor } from "./mapFraming";

const opening: MapFraming = {
  start: "A",
  destination: "B",
  routeFrame: undefined,
  guessCount: 0,
  hintCount: 0,
};

describe("refitFor", () => {
  test("a new guess eases the map to the guess view", () => {
    expect(refitFor(opening, { ...opening, guessCount: 1 })).toBe("guess");
  });

  test("a new trip eases the map to the guess view", () => {
    expect(refitFor(opening, { ...opening, destination: "C" })).toBe("guess");
  });

  test("hint 1, outlining a kommun, eases the map to the hint view", () => {
    expect(refitFor(opening, { ...opening, hintCount: 1 })).toBe("hint");
  });

  test("hint 2, outlining every kommun, leaves the map where it is", () => {
    const hinted = { ...opening, hintCount: 1 };
    expect(refitFor(hinted, { ...hinted, hintCount: 290 })).toBeUndefined();
  });

  test("the outlines going away leaves the map where it is", () => {
    expect(refitFor({ ...opening, hintCount: 1 }, opening)).toBeUndefined();
  });
});
