import { describe, expect, test } from "bun:test";
import { balancedRows } from "./balancedRows";

describe("balancedRows", () => {
  test("keeps everything on one row when it fits", () => {
    expect(balancedRows(5, 6)).toEqual([5]);
    expect(balancedRows(6, 6)).toEqual([6]);
  });

  test("splits overflowing items evenly, longer rows first", () => {
    expect(balancedRows(9, 6)).toEqual([5, 4]);
    expect(balancedRows(7, 6)).toEqual([4, 3]);
    expect(balancedRows(13, 6)).toEqual([5, 4, 4]);
    expect(balancedRows(12, 6)).toEqual([6, 6]);
    expect(balancedRows(13, 3)).toEqual([3, 3, 3, 2, 2]);
  });

  test("puts one item per row when not even one fits", () => {
    expect(balancedRows(2, 0.5)).toEqual([1, 1]);
  });

  test("returns no rows for no items", () => {
    expect(balancedRows(0, 6)).toEqual([]);
  });
});
