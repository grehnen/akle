import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildGraphVersion } from "../graph/graphVersion";
import { DailyPuzzleView } from "./DailyPuzzleView";

const graph = buildGraphVersion({
  id: "test",
  startsAtPuzzle: 1,
  kommuner: [
    { code: "0192", name: "Nynäshamn" },
    { code: "0181", name: "Södertälje" },
    { code: "0488", name: "Trosa" },
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
});
