import { describe, expect, test } from "bun:test";
import { buildGraphVersion } from "../graph/graphVersion";
import { resolveKommunName } from "./kommunNames";

const graph = buildGraphVersion({
  id: "test",
  startsAtPuzzle: 1,
  kommuner: [
    { code: "0139", name: "Upplands-Bro" },
    { code: "1880", name: "Örebro" },
    { code: "0643", name: "Habo" },
    { code: "0305", name: "Håbo" },
  ],
  links: [],
});

describe("resolveKommunName", () => {
  test.each([
    ["Örebro", "1880"],
    ["örebro", "1880"],
    ["  ÖREBRO ", "1880"],
    ["Orebro", "1880"],
    ["Upplands Bro", "0139"],
    ["upplands  -  bro", "0139"],
    ["UpplandsBro", "0139"],
  ])("%p names %p", (input, code) => {
    expect(resolveKommunName(graph, input)).toBe(code);
  });

  test("a literal match beats an accent-folded one", () => {
    expect(resolveKommunName(graph, "habo")).toBe("0643");
    expect(resolveKommunName(graph, "HÅBO")).toBe("0305");
  });

  test("returns undefined for unknown names", () => {
    expect(resolveKommunName(graph, "Bålsta")).toBeUndefined();
    expect(resolveKommunName(graph, "")).toBeUndefined();
  });
});
