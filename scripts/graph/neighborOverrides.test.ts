import { describe, expect, test } from "bun:test";
import { readFerries } from "./neighborOverrides";

const kommuner = [
  { code: "0192", name: "Nynäshamn" },
  { code: "0882", name: "Oskarshamn" },
  { code: "0980", name: "Gotland" },
];

describe("readFerries", () => {
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
    expect(readFerries(yaml, kommuner)).toEqual([
      { between: ["0980", "0192"], kind: "ferry" },
      { between: ["0882", "0980"], kind: "ferry" },
    ]);
  });

  test("rejects a name that doesn't match its code", () => {
    const yaml = `
ferries:
  - between: ["0980", "0192"]
    names: [Gotland, Oskarshamn]
    reason: Visby–Nynäshamn
`;
    expect(() => readFerries(yaml, kommuner)).toThrow(/0192 is Nynäshamn, not Oskarshamn/);
  });

  test("rejects an unknown code", () => {
    const yaml = `
ferries:
  - between: ["0980", "9999"]
    names: [Gotland, Atlantis]
    reason: Visby–Atlantis
`;
    expect(() => readFerries(yaml, kommuner)).toThrow(/unknown kommun code 9999/);
  });

  test("rejects a ferry without a reason", () => {
    const yaml = `
ferries:
  - between: ["0980", "0192"]
    names: [Gotland, Nynäshamn]
`;
    expect(() => readFerries(yaml, kommuner)).toThrow(/needs a reason/);
  });

  test("rejects the same pair listed twice, in either order", () => {
    const yaml = `
ferries:
  - between: ["0980", "0192"]
    names: [Gotland, Nynäshamn]
    reason: Visby–Nynäshamn
  - between: ["0192", "0980"]
    names: [Nynäshamn, Gotland]
    reason: Again
`;
    expect(() => readFerries(yaml, kommuner)).toThrow(/listed twice: 0192-0980/);
  });
});
