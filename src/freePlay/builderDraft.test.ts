import { describe, expect, test } from "bun:test";
import { buildGraphVersion } from "../graph/graphVersion";
import { memoryStorage } from "../progress/storage";
import {
  type BuilderDraft,
  clearBuilderDraft,
  restoreBuilderDraft,
  saveBuilderDraft,
} from "./builderDraft";

// Nynäshamn ── Haninge ── Salem ── Trosa.
const graph = buildGraphVersion({
  id: "current",
  startsAtTrip: 1,
  kommuner: [
    { code: "0192", name: "Nynäshamn" },
    { code: "0136", name: "Haninge" },
    { code: "0128", name: "Salem" },
    { code: "0488", name: "Trosa" },
  ],
  links: [
    { between: ["0192", "0136"], kind: "land" },
    { between: ["0136", "0128"], kind: "land" },
    { between: ["0128", "0488"], kind: "land" },
  ],
});
const version = { graph, ordinal: 2 };
const DRAFT_KEY = "akle:itinerary-draft";

const draft: BuilderDraft = {
  title: "Helgresan",
  trips: [
    {
      trip: { start: "0488", destination: "0136", mode: { kind: "timed", thinkingTime: 17 } },
      drawn: false,
    },
    { trip: { start: "0192", destination: "0128", mode: { kind: "tie-breaker" } }, drawn: true },
    { trip: { start: "0192", destination: "0488", mode: { kind: "unlimited" } }, drawn: false },
  ],
};

const stored = (value: unknown) => {
  const storage = memoryStorage();
  storage.setItem(DRAFT_KEY, typeof value === "string" ? value : JSON.stringify(value));
  return storage;
};

describe("the builder's draft", () => {
  test("keeps the title and the trips in order, with their modes, betänketider and draws", () => {
    const storage = memoryStorage();
    saveBuilderDraft(storage, version.ordinal, draft);
    expect(restoreBuilderDraft(storage, version)).toEqual(draft);
  });

  test("is replaced by each save", () => {
    const storage = memoryStorage();
    saveBuilderDraft(storage, version.ordinal, draft);
    const shorter = { title: "", trips: draft.trips.slice(1) };
    saveBuilderDraft(storage, version.ordinal, shorter);
    expect(restoreBuilderDraft(storage, version)).toEqual(shorter);
  });

  test("is nothing when none is stored, or once cleared", () => {
    const storage = memoryStorage();
    expect(restoreBuilderDraft(storage, version)).toBeUndefined();
    saveBuilderDraft(storage, version.ordinal, draft);
    clearBuilderDraft(storage);
    expect(restoreBuilderDraft(storage, version)).toBeUndefined();
  });

  test("an empty draft is not kept", () => {
    const storage = memoryStorage();
    saveBuilderDraft(storage, version.ordinal, draft);
    saveBuilderDraft(storage, version.ordinal, { title: "", trips: [] });
    expect(storage.getItem(DRAFT_KEY)).toBeNull();
  });

  test("a draft made on another version is outdated, and ignored", () => {
    const storage = memoryStorage();
    saveBuilderDraft(storage, 1, draft);
    expect(restoreBuilderDraft(storage, version)).toBeUndefined();
  });

  const valid = { format: 1, versionOrdinal: 2, title: "Helgresan", trips: draft.trips };
  test.each([
    ["not JSON", "{"],
    ["not a record", [1, 2]],
    ["another format", { ...valid, format: 2 }],
    ["a title that isn't text", { ...valid, title: 3 }],
    ["a title over 40 characters", { ...valid, title: "x".repeat(41) }],
    ["trips that aren't a list", { ...valid, trips: {} }],
    ["over 20 trips", { ...valid, trips: Array.from({ length: 21 }, () => draft.trips[0]) }],
    ["a trip without a draw flag", { ...valid, trips: [{ trip: draft.trips[0].trip }] }],
    [
      "a betänketid out of range",
      {
        ...valid,
        trips: [
          {
            ...draft.trips[0],
            trip: { ...draft.trips[0].trip, mode: { kind: "timed", thinkingTime: 61 } },
          },
        ],
      },
    ],
    [
      "an unknown mode",
      {
        ...valid,
        trips: [{ ...draft.trips[1], trip: { ...draft.trips[1].trip, mode: { kind: "blitz" } } }],
      },
    ],
    [
      "a code the version lacks",
      { ...valid, trips: [{ ...draft.trips[1], trip: { ...draft.trips[1].trip, start: "9999" } }] },
    ],
    [
      "neighbors as a trip",
      {
        ...valid,
        trips: [{ ...draft.trips[1], trip: { ...draft.trips[1].trip, destination: "0136" } }],
      },
    ],
  ])("a stored draft with %s is ignored", (_, value) => {
    expect(restoreBuilderDraft(stored(value), version)).toBeUndefined();
  });
});
