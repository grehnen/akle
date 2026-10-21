import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { History } from "../progress/history";
import { deriveStats } from "../progress/stats";
import { StatsPanel } from "./StatsPanel";

const win = { won: true, extra: 2, perfect: false, hintsUsed: 0, emojiLine: "" };
const loss = { won: false, extra: null, perfect: false, hintsUsed: 0, emojiLine: "" };
const history: History = { 1: win, 2: loss, 3: win, 4: win };
const markup = renderToStaticMarkup(<StatsPanel stats={deriveStats(history, 4)} />);

function figure(label: string): string | undefined {
  return markup.match(new RegExp(`<dt>${label}</dt><dd>([^<]*)</dd>`))?.[1];
}

describe("the stats panel", () => {
  test("shows Spelade, Vinst %, Nuvarande svit and Längsta svit", () => {
    expect(figure("Spelade")).toBe("4");
    expect(figure("Vinst %")).toBe("75");
    expect(figure("Nuvarande svit")).toBe("2");
    expect(figure("Längsta svit")).toBe("2");
  });

  test("lists every distribution row with its count", () => {
    const rows = [...markup.matchAll(/<li[^>]*>.*?<\/li>/g)].map((row) =>
      row[0]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );
    expect(rows).toEqual([
      "Perfekt 0",
      "+0 0",
      "+1 0",
      "+2 3",
      "+3 0",
      "+4 0",
      "+5 0",
      "+6 0",
      "+7 0",
      "+8 0",
      "Förlust 1",
    ]);
  });

  test("highlights today's row", () => {
    const highlighted = markup
      .split("</li>")
      .filter((row) => row.includes('aria-current="true"'))
      .map(
        (row) =>
          row
            .replace(/<[^>]+>/g, " ")
            .trim()
            .split(/\s+/)[0],
      );
    expect(highlighted).toEqual(["+2"]);
  });

  test("splits a row into games without and with hints, with a key", () => {
    const hinted = { ...win, hintsUsed: 2 };
    const split = renderToStaticMarkup(
      <StatsPanel stats={deriveStats({ 1: win, 2: hinted, 3: hinted }, 3)} />,
    );
    const row = split
      .match(/<li[^>]*>.*?<\/li>/g)
      ?.map((li) =>
        li
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .find((text) => text.startsWith("+2"));
    expect(row).toBe("+2 3 , varav 2 med ledtrådar");
    expect(split).toContain("Med ledtrådar");
    expect(markup).not.toContain("Med ledtrådar");
  });
});
