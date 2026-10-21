import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { type Game, reviewGame } from "../engine/game";
import { buildGraphVersion } from "../graph/graphVersion";
import { deriveStats } from "../progress/stats";
import { ResultView } from "./ResultView";

// Nynäshamn ── Södertälje ── Trosa, or Nynäshamn ── Haninge ── Salem ── Trosa; the rest far away.
const graph = buildGraphVersion({
  id: "test",
  startsAtPuzzle: 1,
  kommuner: [
    { code: "0192", name: "Nynäshamn" },
    { code: "0181", name: "Södertälje" },
    { code: "0488", name: "Trosa" },
    { code: "0136", name: "Haninge" },
    { code: "0128", name: "Salem" },
    { code: "0980", name: "Gotland" },
    { code: "0880", name: "Kalmar" },
    { code: "0882", name: "Oskarshamn" },
    { code: "0883", name: "Västervik" },
  ],
  links: [
    { between: ["0192", "0181"], kind: "land" },
    { between: ["0181", "0488"], kind: "land" },
    { between: ["0192", "0136"], kind: "land" },
    { between: ["0136", "0128"], kind: "land" },
    { between: ["0128", "0488"], kind: "land" },
    { between: ["0880", "0882"], kind: "land" },
    { between: ["0882", "0883"], kind: "land" },
  ],
});

const puzzle = { number: 21, start: "0192", destination: "0488" };
const now = new Date(2026, 9, 21, 13, 5, 9);

function routeItems(markup: string): string[] {
  const route = markup.match(/<ol aria-label="Kortaste vägen"[^>]*>(.*?)<\/ol>/)?.[1] ?? "";
  return [...route.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((item) =>
    (item[1] ?? "").replace(/<[^>]+>/g, ""),
  );
}

function render(...guesses: string[]) {
  const game: Game = { puzzle, guesses };
  return renderToStaticMarkup(
    <ResultView
      graph={graph}
      game={game}
      review={reviewGame(graph, game)}
      now={now}
      stats={deriveStats(
        { 20: { won: true, extra: 0, perfect: true, hintsUsed: 0, emojiLine: "✅" } },
        21,
      )}
      shareText="#åkle #21 +1"
    />,
  );
}

describe("the result view", () => {
  describe("after a win", () => {
    const markup = render("0136", "0181");

    test("shows the outcome as +extra", () => {
      expect(markup).toContain("Framme!");
      expect(markup).toContain(">+1<");
    });

    test("shows the emoji line", () => {
      expect(markup).toContain("🟧✅");
    });

    test("shows the shortest route on the map", () => {
      expect(markup).toContain('aria-label="Kortaste vägen från Nynäshamn till Trosa"');
    });

    test("lists the shortest route with the player's guess on it marked", () => {
      expect(routeItems(markup)).toEqual(["Nynäshamn", "Södertälje (gissad)", "Trosa"]);
    });

    test("embeds the stats", () => {
      expect(markup).toContain("Statistik");
      expect(markup).toContain("<dt>Spelade</dt><dd>1</dd>");
    });

    test("offers to copy the share text", () => {
      expect(markup).toMatch(/<button[^>]*>Kopiera resultat<\/button>/);
    });

    test("counts down to the next puzzle at midnight", () => {
      expect(markup).toContain("Nästa pussel om");
      expect(markup).toContain("10:54:51");
    });
  });

  test("a Perfect win shows Perfekt", () => {
    expect(render("0181")).toContain(">Perfekt<");
  });

  describe("after a loss", () => {
    const markup = render("0136", "0980", "0880", "0882", "0883");

    test("shows how many kommuner were missing, and which", () => {
      expect(markup).toContain("Slut på gissningar");
      expect(markup).toContain(">1 kvar<");
      expect(markup).toContain("Saknades: Södertälje");
    });

    test("shows the emoji line", () => {
      expect(markup).toContain("🟧🟥🟥🟥🟥");
    });

    test("lists the shortest route, marking the missed kommuner", () => {
      expect(routeItems(markup)).toEqual(["Nynäshamn", "Södertälje (missad)", "Trosa"]);
    });
  });
});
