import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildGraphVersion } from "../graph/graphVersion";
import { saveGame } from "../progress/savedGame";
import { memoryStorage } from "../progress/storage";
import { DailyPuzzleView } from "./DailyPuzzleView";

/** The text as seen, without what only screen readers read. */
const visibleText = (markup: string) =>
  markup.replace(/<span class="visually-hidden">.*?<\/span>/g, "").replace(/<[^>]+>/g, "");

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
    expect(visibleText(markup)).toContain("Gissa (0/5)");
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
      expect(visibleText(markup)).toContain("Gissa (1/5)");
      expect(markup).toContain("Haninge");
      expect(markup).not.toContain('aria-labelledby="result-heading"');
    });

    test("a game saved for another puzzle number is not restored", () => {
      const markup = renderWith(["0181"], { ...puzzle, number: 20 });
      expect(visibleText(markup)).toContain("Gissa (0/5)");
    });

    test("a finished game reopens on the board with the result view open", () => {
      const markup = renderWith(["0181"]);
      expect(visibleText(markup)).toContain("Gissa (1/5)");
      expect(markup).toContain('aria-labelledby="result-heading"');
      expect(markup).toContain(">Perfekt<");
      expect(markup).toContain("10:54:51");
    });

    test("a finished game keeps the guess input usable, so a guess shows Spelet är slut", () => {
      const markup = renderWith(["0181"]);
      expect(markup).toMatch(/<input id="guess-input"(?![^>]*disabled)[^>]*>/);
      expect(markup).toMatch(/<button type="submit"(?![^>]*disabled)[^>]*>/);
    });

    test("shows the toast right under the guess input, also once the game has ended", () => {
      for (const guesses of [[], ["0181"]]) {
        expect(renderWith(guesses)).toMatch(/<\/form><p role="alert" class="toast">/);
      }
    });

    test("lists past guesses under a heading, before the hints", () => {
      const markup = renderWith(["0136"]);
      expect(visibleText(markup)).toMatch(/Tidigare gissningar:.*Haninge.*Ledtrådar \(0\/3\):/s);
    });

    test("offers three stacked hint buttons before the first guess, only the topmost enabled", () => {
      const markup = renderWith([]);
      expect(markup).toContain('<div role="group" aria-label="Ledtrådar" class="hint-buttons">');
      expect(markup).toMatch(
        /<button[^>]*class="hint-button"(?![^>]*disabled)[^>]*>Visa nästa kommun</,
      );
      expect(markup).toMatch(
        /<button[^>]*class="hint-button"[^>]*disabled=""[^>]*>Visa alla kommuner</,
      );
      expect(markup).toMatch(
        /<button[^>]*class="hint-button"[^>]*disabled=""[^>]*>Visa initialer</,
      );
    });

    test("restores the hints taken, and says what the last one revealed", () => {
      const markup = renderWith(["0136"], puzzle, 2);
      expect(visibleText(markup)).toContain("Visa nästa kommun ✓");
      expect(visibleText(markup)).toContain("Visa alla kommuner ✓");
      expect(markup).toMatch(
        /<button[^>]*class="hint-button"(?![^>]*disabled)[^>]*>Visa initialer</,
      );
      expect(markup).toContain("Alla kommuner syns nu på kartan.");
    });

    test("disables every hint button once all three are taken", () => {
      const markup = renderWith([], puzzle, 3);
      expect(markup.match(/<button[^>]*class="hint-button taken"[^>]*disabled=""/g)).toHaveLength(
        3,
      );
    });

    test("hides the hint buttons once the game has ended", () => {
      expect(renderWith(["0181"], puzzle, 1)).not.toContain("hint-button");
    });

    test("each guess card reads out its number, feedback and connection", () => {
      const markup = renderWith(["0136", "0181"]);
      expect(markup).toContain(
        '<span class="visually-hidden">Gissning 1: Haninge, långt från en kortaste väg, inte ansluten till start.</span>',
      );
      expect(markup).toContain(
        '<span class="visually-hidden">Gissning 2: Södertälje, på kortaste vägen och ansluten.</span>',
      );
    });

    test("the Gissa button says how many are used, and taken hint buttons say so", () => {
      const markup = renderWith(["0136"], puzzle, 1);
      expect(markup).toMatch(/<button type="submit"[^>]*>.*?1 av 5 använda.*?<\/button>/);
      expect(markup).toMatch(
        /<button[^>]*class="hint-button taken"[^>]*>Visa nästa kommun.*?\(använd\).*?<\/button>/,
      );
    });

    test("a restored game announces nothing until the next guess or hint", () => {
      const markup = renderWith(["0136"], puzzle, 1);
      expect(markup).toContain('<p class="visually-hidden" aria-live="polite"></p>');
    });

    test("rejections are shown in an alert", () => {
      expect(renderWith([])).toContain('<p role="alert" class="toast"></p>');
    });

    test("the map has a text description of what it shows", () => {
      const markup = renderWith(["0136"], puzzle, 1);
      expect(markup).toContain(
        "Start (gul): Nynäshamn. Mål (blå): Trosa. Anslutna gissningar: inga. Gissningar som inte är anslutna: Haninge. 1 ledtrådskontur.",
      );
    });

    test("a finished game's result is not announced again on reload", () => {
      const markup = renderWith(["0181"]);
      expect(markup).not.toContain('role="alert">');
      expect(markup).toContain('<p role="alert" class="toast"></p>');
    });

    test("a win with a hint is not Perfekt", () => {
      const markup = renderWith(["0181"], puzzle, 1);
      expect(markup).toContain('<p class="result-score">+0 (1 ledtråd)</p>');
    });
  });
});
