import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { type Game, newGame, reviewGame } from "../engine/game";
import { buildGraphVersion, type GraphVersion } from "../graph/graphVersion";
import { deriveStats } from "../progress/stats";
import { type KeyValueStorage, memoryStorage } from "../progress/storage";
import { ResultView } from "./ResultView";

// Nynäshamn ── Södertälje ── Trosa, or Nynäshamn ── Haninge ── Salem ── Trosa; the rest far away.
const graph = buildGraphVersion({
  id: "test",
  startsAtTrip: 1,
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

const trip = { start: "0192", destination: "0488" };

function routeItems(markup: string, label = "Bästa vägen med dina gissningar"): string[] {
  const route = markup.match(new RegExp(`<ol aria-label="${label}"[^>]*>(.*?)</ol>`))?.[1] ?? "";
  return [...route.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((item) =>
    (item[1] ?? "").replace(/<[^>]+>/g, ""),
  );
}

function tabs(markup: string): { name: string; selected: boolean }[] {
  return [...markup.matchAll(/<button[^>]*role="tab"[^>]*>(.*?)<\/button>/g)].map((tab) => ({
    name: tab[1] ?? "",
    selected: tab[0].includes('aria-selected="true"'),
  }));
}

function render(...guesses: string[]) {
  return renderOn(graph, trip, guesses);
}

/** Renders as if the player last picked `tab` this session. */
function renderOnTab(tab: string, ...guesses: string[]) {
  const sessionStorage = memoryStorage();
  sessionStorage.setItem("akle:result-tab", JSON.stringify(tab));
  return renderOn(graph, trip, guesses, sessionStorage);
}

function renderOn(
  onGraph: GraphVersion,
  onTrip: Game["trip"],
  guesses: string[],
  sessionStorage: KeyValueStorage = memoryStorage(),
) {
  const game: Game = { ...newGame(onTrip), guesses };
  return renderToStaticMarkup(
    <ResultView
      graph={onGraph}
      game={game}
      review={reviewGame(onGraph, game)}
      stats={deriveStats(
        { 20: { won: true, extra: 0, perfect: true, hintsUsed: 0, emojiLine: "✅" } },
        21,
      )}
      sessionStorage={sessionStorage}
    />,
  );
}

describe("the result view", () => {
  describe("after a win", () => {
    const markup = render("0136", "0181");

    test("shows the outcome as Framme! (+extra)", () => {
      expect(markup).toContain(">Framme! (+1)</h2>");
    });

    test("shows the emoji line", () => {
      expect(markup).toContain("🟧✅");
    });

    test("shows the cheapest route on the map", () => {
      expect(markup).toContain(
        'aria-label="Bästa vägen med dina gissningar från Nynäshamn till Trosa"',
      );
    });

    test("lists the cheapest route with the player's guess on it marked", () => {
      expect(routeItems(markup)).toEqual(["Nynäshamn", "Södertälje (gissad)", "Trosa"]);
    });

    test("has the tabs Min rutt, Kortaste rutt and Statistik, opening on Min rutt", () => {
      expect(tabs(markup)).toEqual([
        { name: "Min rutt", selected: true },
        { name: "Kortaste rutt", selected: false },
        { name: "Statistik", selected: false },
      ]);
    });

    test("keeps the stats out of the Min rutt tab", () => {
      expect(markup).not.toContain("<dt>Spelade</dt>");
    });
  });

  test("a Perfect win shows Perfekt!", () => {
    expect(render("0181")).toContain(">Perfekt!</h2>");
  });

  describe("after a loss", () => {
    const markup = render("0136", "0980", "0880", "0882", "0883");

    test("shows how many kommuner were missing, leaving which to the route", () => {
      expect(markup).toContain(">Slut på gissningar (1 ifrån)</h2>");
      expect(markup).not.toContain("Saknades");
    });

    test("shows the emoji line", () => {
      expect(markup).toContain("🟧🟥🟥🟥🟥");
    });

    test("lists the cheapest route, marking the missed kommuner", () => {
      expect(routeItems(markup)).toEqual(["Nynäshamn", "Södertälje (missad)", "Trosa"]);
    });
  });

  test("after a loss, marks the same missed kommuner in the count and the cheapest route", () => {
    // S ── A ── B ── T is shortest, but the guesses X and Y leave only Z missing on S ── X ── Y ── Z ── T.
    const detour = buildGraphVersion({
      id: "detour",
      startsAtTrip: 1,
      kommuner: ["S", "A", "B", "T", "X", "Y", "Z", "F1", "F2", "F3", "F4"].map((code) => ({
        code,
        name: `Kommun ${code}`,
      })),
      links: [
        ["S", "A"],
        ["A", "B"],
        ["B", "T"],
        ["S", "X"],
        ["X", "Y"],
        ["Y", "Z"],
        ["Z", "T"],
        ["F1", "F2"],
        ["F2", "F3"],
        ["F3", "F4"],
      ].map(([a, b]) => ({ between: [a, b] as const, kind: "land" as const })),
    });
    const markup = renderOn(detour, { start: "S", destination: "T" }, [
      "X",
      "Y",
      "F1",
      "F2",
      "F3",
      "F4",
    ]);
    expect(markup).toContain("(1 ifrån)");
    expect(routeItems(markup)).toEqual([
      "Kommun S",
      "Kommun X (gissad)",
      "Kommun Y (gissad)",
      "Kommun Z (missad)",
      "Kommun T",
    ]);
  });

  describe("on the Kortaste rutt tab", () => {
    test("shows the shortest route on the map and lists it, marking the guesses on it", () => {
      // Haninge and Salem win by a detour; Södertälje is the shortest way.
      const markup = renderOnTab("shortest", "0136", "0128");
      expect(tabs(markup).find((tab) => tab.selected)?.name).toBe("Kortaste rutt");
      expect(markup).toContain('aria-label="Kortaste rutten från Nynäshamn till Trosa"');
      expect(routeItems(markup, "Kortaste rutten")).toEqual([
        "Nynäshamn",
        "Södertälje (missad)",
        "Trosa",
      ]);
      expect(routeItems(markup)).toEqual([]);
      expect(markup).not.toContain("Din rutt var en av de kortaste!");
    });

    test("marks a guess on the shortest route as guessed", () => {
      expect(routeItems(renderOnTab("shortest", "0136", "0181"), "Kortaste rutten")).toEqual([
        "Nynäshamn",
        "Södertälje (gissad)",
        "Trosa",
      ]);
    });

    test("says so when Min rutt is already a shortest route", () => {
      expect(renderOnTab("shortest", "0181")).toContain("Din rutt var en av de kortaste!");
    });
  });

  test("the Statistik tab shows the stats and no route", () => {
    const markup = renderOnTab("stats", "0181");
    expect(tabs(markup).find((tab) => tab.selected)?.name).toBe("Statistik");
    expect(markup).toContain("<dt>Spelade</dt><dd>1</dd>");
    expect(markup).not.toContain("satellite-map");
  });

  test("ignores a stored tab it doesn't know, opening on Min rutt", () => {
    expect(tabs(renderOnTab("karta", "0181")).find((tab) => tab.selected)?.name).toBe("Min rutt");
  });
});
