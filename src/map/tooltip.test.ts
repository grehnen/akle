import { describe, expect, test } from "bun:test";
import { buildGraphVersion } from "../graph/graphVersion";
import { tooltipText } from "./tooltip";

const graph = buildGraphVersion({
  id: "test",
  startsAtPuzzle: 1,
  kommuner: [
    { code: "0139", name: "Upplands-Bro" },
    { code: "0180", name: "Stockholm" },
  ],
  links: [],
});

describe("tooltipText", () => {
  test.each(["start", "destination", "guess", "missed", "other"] as const)(
    "a %s shows its full name",
    (kind) => {
      expect(tooltipText(graph, { code: "0139", kind }, { initials: false })).toBe("Upplands-Bro");
    },
  );

  test("a hint outline shows ? until hint 3", () => {
    expect(tooltipText(graph, { code: "0139", kind: "hint" }, { initials: false })).toBe("?");
  });

  test("after hint 3, a hint outline shows the initial of each word", () => {
    expect(tooltipText(graph, { code: "0139", kind: "hint" }, { initials: true })).toBe("U… B…");
  });

  test("an unknown kommun shows nothing", () => {
    expect(tooltipText(graph, { code: "9999", kind: "guess" }, { initials: true })).toBeUndefined();
  });
});
