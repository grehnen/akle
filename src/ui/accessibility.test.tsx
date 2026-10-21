import { afterAll, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildGraphVersion } from "../graph/graphVersion";
import { saveGame } from "../progress/savedGame";
import { memoryStorage } from "../progress/storage";
import { DailyPuzzleView } from "./DailyPuzzleView";
import { GuessInput } from "./GuessInput";

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
  ],
  links: [
    { between: ["0192", "0181"], kind: "land" },
    { between: ["0181", "0488"], kind: "land" },
  ],
});

const puzzle = { number: 21, start: "0192", destination: "0488", n: 1 };

const dom = new JSDOM(
  '<!doctype html><html lang="sv"><head><title>Åkle</title></head><body></body></html>',
  { pretendToBeVisual: true },
);
// axe-core reads the page through the globals it finds when it loads.
Object.assign(globalThis, { window: dom.window, document: dom.window.document });
const { default: axe } = await import("axe-core");
afterAll(() => {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "document");
});

/** Serious and critical axe violations on a page made of `body`, as App lays it out. */
async function seriousViolations(body: ReactElement): Promise<string[]> {
  dom.window.document.body.innerHTML = renderToStaticMarkup(
    <main>
      <header className="site-header">
        <h1>Åkle</h1>
      </header>
      {body}
    </main>,
  );
  const results = await axe.run(dom.window.document.documentElement, {
    // jsdom can't lay out or paint, so contrast is checked by eye.
    rules: { "color-contrast": { enabled: false } },
  });
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.html).join(" ")}`);
}

function playScreen(guesses: string[], hintsTaken = 0) {
  const storage = memoryStorage();
  const hints = hintsTaken > 0 ? { taken: hintsTaken, nextKommun: "0181" } : undefined;
  saveGame(storage, { puzzle, guesses, hints });
  return (
    <DailyPuzzleView
      daily={{ kind: "puzzle", puzzle, graph }}
      storage={storage}
      now={new Date(2026, 9, 21, 13, 5, 9)}
    />
  );
}

describe("automated accessibility check", () => {
  test("the play screen with a guess and a hint has no serious violations", async () => {
    expect(await seriousViolations(playScreen(["0136"], 1))).toEqual([]);
  });

  test("the guess input with its suggestions open has no serious violations", async () => {
    const input = (
      <GuessInput
        text="s"
        suggestions={[
          { code: "0181", name: "Södertälje" },
          { code: "0192", name: "Nynäshamn", disabled: "start" },
        ]}
        highlighted="0181"
        counter="Gissa"
        disabled={false}
        onEvent={() => {}}
      />
    );
    expect(await seriousViolations(input)).toEqual([]);
  });

  test.each([
    ["won", ["0181"]],
    ["lost", ["0136", "0128", "0980", "0880", "0882"]],
  ])("the result view of a %s game has no serious violations", async (_, guesses) => {
    expect(await seriousViolations(playScreen(guesses))).toEqual([]);
  });
});
