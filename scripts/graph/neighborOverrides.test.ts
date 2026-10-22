import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { readNeighborOverrides } from "./neighborOverrides";
import { committedDataSource } from "../../src/data/committedDataSource";
import { parseGraphVersionFiles } from "../../src/graph/graphVersionFiles";

const kommuner = [
  { code: "0125", name: "Ekerö" },
  { code: "0180", name: "Stockholm" },
  { code: "0192", name: "Nynäshamn" },
  { code: "0882", name: "Oskarshamn" },
  { code: "0980", name: "Gotland" },
];

const osmKommuner = [
  ...parseGraphVersionFiles(
    await committedDataSource.graphVersionFiles("osm-2026-10-01"),
  ).kommuner.values(),
];

describe("readNeighborOverrides", () => {
  test("reads the ferry list as ferry links keyed by SCB codes", () => {
    const yaml = `
ferries:
  - between: ["0980", "0192"]
    names: [Gotland, Nynäshamn]
    reason: Visby–Nynäshamn
  - between: ["0882", "0980"]
    names: [Oskarshamn, Gotland]
    reason: Oskarshamn–Visby
`;
    expect(readNeighborOverrides(yaml, kommuner).ferries).toEqual([
      { between: ["0980", "0192"], kind: "ferry" },
      { between: ["0882", "0980"], kind: "ferry" },
    ]);
  });

  test("reads add and remove overrides and keep verdicts, each pair sorted by code", () => {
    const yaml = `
overrides:
  - remove: ["0180", "0125"]
    names: [Stockholm, Ekerö]
    reason: A 42 m sliver across Hässelby holme.
    evidence: https://www.openstreetmap.org/way/1
  - add: ["0192", "0180"]
    link: fixed
    names: [Nynäshamn, Stockholm]
    reason: A bridge OSM misses.
    evidence: https://example.org/bridge
reviewed:
  - keep: ["0882", "0980"]
    names: [Oskarshamn, Gotland]
    kinds: [short-border, scb-mismatch, island-border, exclave-border]
    reason: Checked on the map.
`;
    const read = readNeighborOverrides(yaml, kommuner);
    expect(read.ferries).toEqual([]);
    expect(read.overrides).toEqual([
      {
        between: ["0125", "0180"],
        action: "remove",
        reason: "A 42 m sliver across Hässelby holme.",
        evidence: "https://www.openstreetmap.org/way/1",
      },
      {
        between: ["0180", "0192"],
        action: "add",
        link: "fixed",
        reason: "A bridge OSM misses.",
        evidence: "https://example.org/bridge",
      },
    ]);
    expect(read.reviewed).toEqual([
      {
        between: ["0882", "0980"],
        kinds: ["short-border", "scb-mismatch", "island-border", "exclave-border"],
        reason: "Checked on the map.",
      },
    ]);
  });

  test("an empty file has no entries", () => {
    expect(readNeighborOverrides("", kommuner)).toEqual({
      ferries: [],
      overrides: [],
      reviewed: [],
    });
  });

  test("rejects a name that doesn't match its code", () => {
    const yaml = `
ferries:
  - between: ["0980", "0192"]
    names: [Gotland, Oskarshamn]
    reason: Visby–Nynäshamn
`;
    expect(() => readNeighborOverrides(yaml, kommuner)).toThrow(
      /ferries\[0\]: 0192 is Nynäshamn, not Oskarshamn/,
    );
  });

  test("rejects an unknown code", () => {
    const yaml = `
reviewed:
  - keep: ["0980", "9999"]
    names: [Gotland, Atlantis]
    kinds: [point-touch]
    reason: Sunk.
`;
    expect(() => readNeighborOverrides(yaml, kommuner)).toThrow(
      /reviewed\[0\]: unknown kommun code 9999/,
    );
  });

  test("rejects an entry without a reason", () => {
    const yaml = `
ferries:
  - between: ["0980", "0192"]
    names: [Gotland, Nynäshamn]
`;
    expect(() => readNeighborOverrides(yaml, kommuner)).toThrow(/ferries\[0\]: needs a reason/);
  });

  test("rejects an override without an evidence link", () => {
    const yaml = `
overrides:
  - remove: ["0125", "0180"]
    names: [Ekerö, Stockholm]
    reason: Sliver.
    evidence: my memory
`;
    expect(() => readNeighborOverrides(yaml, kommuner)).toThrow(
      /overrides\[0\]: needs an evidence link/,
    );
  });

  test("rejects an override that is neither an add nor a remove", () => {
    const yaml = `
overrides:
  - between: ["0125", "0180"]
    names: [Ekerö, Stockholm]
    reason: Sliver.
    evidence: https://example.org
`;
    expect(() => readNeighborOverrides(yaml, kommuner)).toThrow(
      /overrides\[0\]: needs either add or remove/,
    );
  });

  test("rejects an add without a land or fixed link", () => {
    const yaml = `
overrides:
  - add: ["0125", "0192"]
    names: [Ekerö, Nynäshamn]
    reason: Ferry.
    evidence: https://example.org
`;
    expect(() => readNeighborOverrides(yaml, kommuner)).toThrow(
      /overrides\[0\]: link must be land or fixed/,
    );
  });

  test("rejects a keep without known flag kinds", () => {
    const yaml = `
reviewed:
  - keep: ["0125", "0180"]
    names: [Ekerö, Stockholm]
    kinds: [too-pretty]
    reason: Fine.
`;
    expect(() => readNeighborOverrides(yaml, kommuner)).toThrow(
      /reviewed\[0\]: kinds must list flag kinds from scb-mismatch, short-border, point-touch, non-qualifying-link, island-border, exclave-border/,
    );
  });

  test("rejects the same pair listed twice, in either order and across sections", () => {
    const yaml = `
ferries:
  - between: ["0980", "0192"]
    names: [Gotland, Nynäshamn]
    reason: Visby–Nynäshamn
reviewed:
  - keep: ["0192", "0980"]
    names: [Nynäshamn, Gotland]
    kinds: [scb-mismatch]
    reason: Again
`;
    expect(() => readNeighborOverrides(yaml, kommuner)).toThrow(
      /reviewed\[0\]: 0192-0980 is already listed in ferries\[0\]/,
    );
  });

  describe("the documented format", () => {
    test("parses the example in data/README.md", () => {
      const readme = readFileSync("data/README.md", "utf8");
      const section = readme.slice(readme.indexOf("### Reviewing flagged pairs"));
      const example = /```yaml\n([\s\S]*?)```/.exec(section)?.[1] ?? "";
      const read = readNeighborOverrides(example, osmKommuner);
      expect(read.overrides).toEqual([
        {
          between: ["0114", "0139"],
          action: "remove",
          reason: "Why the generated graph is wrong.",
          evidence: "https://example.org/evidence",
        },
      ]);
      expect(read.reviewed).toEqual([
        {
          between: ["0305", "0330"],
          kinds: ["scb-mismatch", "non-qualifying-link"],
          reason: "Why the generated graph is right.",
        },
      ]);
    });

    test("parses the commented examples in data/neighbor-overrides.yaml", () => {
      const header = readFileSync("data/neighbor-overrides.yaml", "utf8");
      const entries = header
        .split("\n")
        .filter((line) => /^# {3}/.test(line))
        .map((line) => line.slice(2))
        .join("\n")
        .replaceAll('"<code>", "<code>"', '"0123", "0139"')
        .replaceAll("<name>, <name>", "Järfälla, Upplands-Bro")
        .split(/\n(?= {2}- )/);
      const [overrideExample, reviewedExample] = entries;
      expect(entries).toHaveLength(2);
      expect(
        readNeighborOverrides(`overrides:\n${overrideExample}`, osmKommuner).overrides,
      ).toMatchObject([{ between: ["0123", "0139"], action: "remove" }]);
      expect(
        readNeighborOverrides(`reviewed:\n${reviewedExample}`, osmKommuner).reviewed,
      ).toMatchObject([{ between: ["0123", "0139"], kinds: ["short-border"] }]);
    });
  });
});
