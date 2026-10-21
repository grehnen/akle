import { describe, expect, test } from "bun:test";
import { reportIssueUrl } from "./reportIssue";

describe("reportIssueUrl", () => {
  const url = new URL(reportIssueUrl({ puzzleNumber: 42, graphVersion: "2026-01" }));

  test("opens a new issue in this repo", () => {
    expect(`${url.origin}${url.pathname}`).toBe("https://github.com/grehnen/akle/issues/new");
  });

  test("prefills the title and body with the puzzle number", () => {
    expect(url.searchParams.get("title")).toBe("Fel i pussel #42");
    expect(url.searchParams.get("body")).toContain("Pussel: #42");
    expect(url.searchParams.get("body")).toContain("Grafversion: 2026-01");
  });

  test("asks about wrong neighbors or names", () => {
    const body = url.searchParams.get("body") ?? "";
    expect(body).toContain("grannar");
    expect(body).toContain("namn");
  });
});
