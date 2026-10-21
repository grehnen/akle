import { describe, expect, test } from "bun:test";
import { readCsv } from "./csv";

describe("readCsv", () => {
  test("reads the rows under the header, skipping blank lines", () => {
    expect(readCsv("a,b\n1,2\n\n3,4\n", "a,b", "x.csv")).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  test("rejects another header, and rows with missing or empty fields", () => {
    expect(() => readCsv("a,c\n", "a,b", "x.csv")).toThrow('x.csv header must be "a,b"');
    expect(() => readCsv("a,b\n1\n", "a,b", "x.csv")).toThrow("x.csv line 2: expected 2 fields");
    expect(() => readCsv("a,b\n1,\n", "a,b", "x.csv")).toThrow("x.csv line 2");
  });

  test("names the file and line when a row can't be read", () => {
    const toRow = ([a]: string[]) => {
      if (a === "x") throw new Error("bad a");
      return a;
    };
    expect(() => readCsv("a,b\n1,2\n\nx,2\n", "a,b", "x.csv", toRow)).toThrow(
      "x.csv line 4: bad a",
    );
  });
});
