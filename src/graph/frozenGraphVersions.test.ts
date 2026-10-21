import { describe, expect, test } from "bun:test";
import { frozenGraphVersionViolations, type CommittedGraphVersion } from "./frozenGraphVersions";

const files = {
  "version.json": "v1",
  "kommuner.csv": "k1",
  "neighbors.csv": "n1",
  "shapes.geojson": "s1",
};
const fixture: CommittedGraphVersion = { id: "fixture", startsAtPuzzle: 1, files };
const osm: CommittedGraphVersion = { id: "osm", startsAtPuzzle: 31, files };

describe("frozenGraphVersionViolations", () => {
  test("accepts unchanged versions", () => {
    expect(
      frozenGraphVersionViolations({
        previous: [fixture, osm],
        current: [fixture, osm],
        playedThrough: 40,
      }),
    ).toEqual([]);
  });

  test("rejects a changed, added or removed file in a version a played puzzle has used", () => {
    const changed = {
      ...fixture,
      files: { "version.json": "v1", "kommuner.csv": "k2", "neighbors.csv": "n1", "notes.md": "x" },
    };
    expect(
      frozenGraphVersionViolations({ previous: [fixture], current: [changed], playedThrough: 1 }),
    ).toEqual([
      "Graph version fixture is frozen (played since #1): kommuner.csv changed",
      "Graph version fixture is frozen (played since #1): shapes.geojson removed",
      "Graph version fixture is frozen (played since #1): notes.md added",
    ]);
  });

  test("rejects removing a played version or moving its start", () => {
    expect(
      frozenGraphVersionViolations({
        previous: [fixture, osm],
        current: [{ ...osm, startsAtPuzzle: 35 }],
        playedThrough: 31,
      }),
    ).toEqual([
      "Graph version fixture is frozen (played since #1): removed",
      "Graph version osm is frozen (played since #31): starting puzzle moved to #35",
    ]);
  });

  test("lets a version change until its first puzzle is played", () => {
    const rebuilt = { ...osm, files: { ...files, "neighbors.csv": "n2" } };
    expect(
      frozenGraphVersionViolations({
        previous: [fixture, osm],
        current: [fixture, { ...rebuilt, startsAtPuzzle: 32 }],
        playedThrough: 30,
      }),
    ).toEqual([]);
  });

  test("rejects a new or moved version that starts at an already played puzzle", () => {
    expect(
      frozenGraphVersionViolations({
        previous: [fixture, osm],
        current: [
          fixture,
          { ...osm, startsAtPuzzle: 20 },
          { ...osm, id: "new", startsAtPuzzle: 25 },
        ],
        playedThrough: 30,
      }),
    ).toEqual([
      "Graph version osm starts at #20, but puzzles up to #30 are already played",
      "Graph version new starts at #25, but puzzles up to #30 are already played",
    ]);
  });

  test("accepts bootstrapping versions from a base with no versions and no schedule", () => {
    expect(
      frozenGraphVersionViolations({ previous: [], current: [fixture, osm], playedThrough: 0 }),
    ).toEqual([]);
  });
});
