import { describe, expect, test } from "bun:test";
import { reportIssueUrl } from "./reportIssue";

describe("reportIssueUrl", () => {
  const url = new URL(reportIssueUrl({ tripNumber: 42, graphVersion: "2026-01" }));

  test("opens a new issue in this repo", () => {
    expect(`${url.origin}${url.pathname}`).toBe("https://github.com/grehnen/akle/issues/new");
  });

  test("prefills the title and body with the trip number", () => {
    expect(url.searchParams.get("title")).toBe("Fel i resa #42");
    expect(url.searchParams.get("body")).toContain("Resa: #42");
    expect(url.searchParams.get("body")).toContain("Grafversion: 2026-01");
  });

  test("asks about wrong neighbors or names", () => {
    const body = url.searchParams.get("body") ?? "";
    expect(body).toContain("grannar");
    expect(body).toContain("namn");
  });
});
