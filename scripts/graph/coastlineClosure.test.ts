import { describe, expect, test } from "bun:test";
import { closeMainlandCoastline } from "./coastlineClosure";

const positions = new Map([
  ["1", [0, 0]],
  ["2", [1, 0]],
  ["3", [2, 1]],
  ["4", [5, 5]],
  ["5", [6, 5]],
  ["6", [6, 6]],
  ["7", [9, 9]],
  ["8", [9, 8]],
]);

describe("closeMainlandCoastline", () => {
  test("closes the longest open chain along the outside route and drops other open fragments", () => {
    const closure = closeMainlandCoastline(
      [
        { id: "10", nodes: ["1", "2"] },
        { id: "11", nodes: ["2", "3"] },
        { id: "12", nodes: ["4", "5", "6", "4"] },
        { id: "13", nodes: ["7", "8"] },
      ],
      positions,
      [
        [3, 3],
        [-1, 3],
      ],
    );
    expect(closure.droppedWays).toEqual(["13"]);
    expect(closure.opl).toBe(
      ["n-1 v1 x3 y3", "n-2 v1 x-1 y3", "w-1 v1 Tnatural=coastline Nn3,n-1,n-2,n1", ""].join("\n"),
    );
  });

  test("fails when there is no open chain to close", () => {
    expect(() =>
      closeMainlandCoastline([{ id: "12", nodes: ["4", "5", "6", "4"] }], positions, [[0, 9]]),
    ).toThrow("open");
  });
});
