import { describe, expect, test } from "bun:test";
import { type KeyValueStorage, memoryStorage } from "../progress/storage";
import {
  chosenMode,
  restoreSetupChoice,
  type SetupChoice,
  saveSetupChoice,
  setupChoiceOfTrip,
} from "./setupChoice";

const SETUP_KEY = "akle:free-play-setup";
const LARGEST = 10;
const defaults: SetupChoice = { mode: "standard", thinkingTime: 10, range: { min: 3, max: 8 } };

const stored = (value: unknown) => {
  const storage = memoryStorage();
  storage.setItem(SETUP_KEY, typeof value === "string" ? value : JSON.stringify(value));
  return storage;
};

describe("the setup choice", () => {
  test("is the defaults when none is kept: Standard, 10 s and 3–8 cut to the largest distance", () => {
    expect(restoreSetupChoice(memoryStorage(), LARGEST)).toEqual(defaults);
    expect(restoreSetupChoice(memoryStorage(), 5)).toEqual({
      ...defaults,
      range: { min: 3, max: 5 },
    });
  });

  test("keeps the mode, the betänketid and the range", () => {
    const storage = memoryStorage();
    const choice: SetupChoice = {
      mode: "tie-breaker",
      thinkingTime: 12,
      range: { min: 1, max: 2 },
    };
    saveSetupChoice(storage, choice);
    expect(restoreSetupChoice(storage, LARGEST)).toEqual(choice);
  });

  test("clamps a kept range to the version's largest distance", () => {
    const storage = memoryStorage();
    saveSetupChoice(storage, { mode: "unlimited", thinkingTime: 10, range: { min: 4, max: 12 } });
    expect(restoreSetupChoice(storage, 6).range).toEqual({ min: 4, max: 6 });
    expect(restoreSetupChoice(storage, 3).range).toEqual({ min: 3, max: 3 });
  });

  const valid = { format: 1, mode: "timed", thinkingTime: 12, range: { min: 1, max: 2 } };
  test.each([
    ["not JSON", "{oops"],
    ["not an object", [1, 2]],
    ["of another format", { ...valid, format: 2 }],
    ["an unknown mode", { ...valid, mode: "blitz" }],
    ["a betänketid below the range", { ...valid, thinkingTime: 4 }],
    ["a betänketid above the range", { ...valid, thinkingTime: 61 }],
    ["a betänketid not in whole seconds", { ...valid, thinkingTime: 12.5 }],
    ["no range", { ...valid, range: undefined }],
    ["a range below 1", { ...valid, range: { min: 0, max: 2 } }],
    ["a range turned round", { ...valid, range: { min: 3, max: 2 } }],
    ["a range not in whole distances", { ...valid, range: { min: 1, max: "2" } }],
  ])("is the defaults when the kept one is %s", (_, value) => {
    expect(restoreSetupChoice(stored(value), LARGEST)).toEqual(defaults);
  });

  test("reads the valid shape this module writes", () => {
    expect(restoreSetupChoice(stored(valid), LARGEST)).toEqual({
      mode: "timed",
      thinkingTime: 12,
      range: { min: 1, max: 2 },
    });
  });

  test("never breaks on full or blocked storage", () => {
    const blocked: KeyValueStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {},
    };
    expect(() => saveSetupChoice(blocked, defaults)).not.toThrow();
    expect(restoreSetupChoice(blocked, LARGEST)).toEqual(defaults);
  });
});

describe("a setup choice and a trip's mode", () => {
  const chosen: SetupChoice = { mode: "timed", thinkingTime: 25, range: { min: 2, max: 4 } };

  test("the chosen mode is Tidspress with its betänketid, or just the mode's kind", () => {
    expect(chosenMode(chosen)).toEqual({ kind: "timed", thinkingTime: 25 });
    expect(chosenMode({ ...chosen, mode: "unlimited" })).toEqual({ kind: "unlimited" });
  });

  test("a trip's choice has its mode, its own betänketid and the range it was drawn from", () => {
    const trip = { kind: "timed", thinkingTime: 45 } as const;
    expect(setupChoiceOfTrip(trip, { min: 5, max: 6 }, chosen)).toEqual({
      mode: "timed",
      thinkingTime: 45,
      range: { min: 5, max: 6 },
    });
  });

  test("a trip without a range or a betänketid of its own takes the fallback's", () => {
    expect(setupChoiceOfTrip({ kind: "standard" }, undefined, chosen)).toEqual({
      mode: "standard",
      thinkingTime: 25,
      range: { min: 2, max: 4 },
    });
  });
});
