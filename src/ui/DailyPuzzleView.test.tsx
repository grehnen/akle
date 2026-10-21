import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildGraphVersion } from "../graph/graphVersion";
import { saveGame } from "../progress/savedGame";
import { memoryStorage } from "../progress/storage";
import { DailyPuzzleView } from "./DailyPuzzleView";

const graph = buildGraphVersion({
  id: "test",
  startsAtPuzzle: 1,
  kommuner: [
    { code: "0192", name: "Nynäshamn" },
    { code: "0181", name: "Södertälje" },
    { code: "0488", name: "Trosa" },
    { code: "0136", name: "Haninge" },
  ],
  links: [
    { between: ["0192", "0181"], kind: "land" },
    { between: ["0181", "0488"], kind: "land" },
  ],
});

describe("DailyPuzzleView", () => {
  test("shows a loading text before the puzzle has loaded", () => {
    expect(renderToStaticMarkup(<DailyPuzzleView daily={undefined} />)).toContain("Laddar");
  });

  test.each(["before-epoch", "schedule-ended"] as const)(
    "shows the Swedish no-puzzle message (%s)",
    (reason) => {
      const markup = renderToStaticMarkup(
        <DailyPuzzleView daily={{ kind: "no-puzzle", reason }} />,
      );
      expect(markup).toContain("Inget pussel i dag");
    },
  );

  test("shows the puzzle's start, destination and guess counter", () => {
    const markup = renderToStaticMarkup(
      <DailyPuzzleView
        daily={{
          kind: "puzzle",
          puzzle: { number: 21, start: "0192", destination: "0488", n: 1 },
          graph,
        }}
      />,
    );
    expect(markup).toContain("Res från <strong>Nynäshamn</strong> till <strong>Trosa</strong>");
    expect(markup).toContain("#21");
    expect(markup).toContain("Gissa (0/5)");
  });

  describe("on the play screen", () => {
    const markup = renderToStaticMarkup(
      <DailyPuzzleView
        daily={{
          kind: "puzzle",
          puzzle: { number: 21, start: "0192", destination: "0488", n: 1 },
          graph,
        }}
      />,
    );

    test("shows the satellite map", () => {
      expect(markup).toContain('aria-label="Karta över Nynäshamn och Trosa"');
    });

    test("notes that the graph and shape data are under ODbL", () => {
      expect(markup).toContain("OpenStreetMap");
      expect(markup).toContain("ODbL");
    });

    test("links Rapportera fel to a prefilled issue for this puzzle", () => {
      const link = markup.match(/<a href="([^"]+)"[^>]*>Rapportera fel<\/a>/);
      const href = new URL((link?.[1] ?? "").replaceAll("&amp;", "&"));
      expect(href.pathname).toBe("/grehnen/akle/issues/new");
      expect(href.searchParams.get("title")).toBe("Fel i pussel #21");
    });
  });

  describe("with a saved game", () => {
    const puzzle = { number: 21, start: "0192", destination: "0488", n: 1 };
    const renderWith = (guesses: string[], savedFor = puzzle, hintsTaken = 0) => {
      const storage = memoryStorage();
      const hints = hintsTaken > 0 ? { taken: hintsTaken, nextKommun: "0181" } : undefined;
      saveGame(storage, { puzzle: savedFor, guesses, hints });
      return renderToStaticMarkup(
        <DailyPuzzleView
          daily={{ kind: "puzzle", puzzle, graph }}
          storage={storage}
          now={new Date(2026, 9, 21, 13, 5, 9)}
        />,
      );
    };

    test("a game in progress is restored and keeps playing", () => {
      const markup = renderWith(["0136"]);
      expect(markup).toContain("Gissa (1/5)");
      expect(markup).toContain("Haninge");
      expect(markup).not.toContain('aria-labelledby="result-heading"');
    });

    test("a game saved for another puzzle number is not restored", () => {
      const markup = renderWith(["0181"], { ...puzzle, number: 20 });
      expect(markup).toContain("Gissa (0/5)");
    });

    test("a finished game reopens on the board with the result view open", () => {
      const markup = renderWith(["0181"]);
      expect(markup).toContain("Gissa (1/5)");
      expect(markup).toContain('aria-labelledby="result-heading"');
      expect(markup).toContain(">Perfekt<");
      expect(markup).toContain("10:54:51");
    });

    test("offers Ledtråd (0/3) before the first guess", () => {
      expect(renderWith([])).toMatch(/<button[^>]*>Ledtråd \(0\/3\)<\/button>/);
    });

    test("restores the hints taken, and says what the last one revealed", () => {
      const markup = renderWith(["0136"], puzzle, 2);
      expect(markup).toContain("Ledtråd (2/3)");
      expect(markup).toContain("Alla kommuner syns nu på kartan.");
    });

    test("disables Ledtråd once all three are taken", () => {
      expect(renderWith([], puzzle, 3)).toMatch(/<button[^>]*disabled=""[^>]*>Ledtråd \(3\/3\)/);
    });

    test("hides Ledtråd once the game has ended", () => {
      expect(renderWith(["0181"], puzzle, 1)).not.toContain("Ledtråd (");
    });

    test("a win with a hint is not Perfekt", () => {
      const markup = renderWith(["0181"], puzzle, 1);
      expect(markup).toContain('<p class="result-score">+0 (1 ledtråd)</p>');
    });
  });
});
