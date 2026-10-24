import { afterAll, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildGraphVersion } from "../graph/graphVersion";
import { saveGame } from "../progress/savedGame";
import { memoryStorage } from "../progress/storage";
import { DailyTripView } from "./DailyTripView";
import { EndpointField } from "./EndpointField";
import { FreePlayLinkError } from "./FreePlayLinkError";
import { FreePlayScreen } from "./FreePlayScreen";
import { GuessInput } from "./GuessInput";

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
  ],
  links: [
    { between: ["0192", "0181"], kind: "land" },
    { between: ["0181", "0488"], kind: "land" },
  ],
});

const trip = { number: 21, start: "0192", destination: "0488", n: 1 };

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

function playScreen(guesses: string[], hintsTaken = 0, sessionStorage = memoryStorage()) {
  const storage = memoryStorage();
  const hints = hintsTaken > 0 ? { taken: hintsTaken, nextKommun: "0181" } : undefined;
  saveGame(storage, { trip, guesses, hints });
  return (
    <DailyTripView
      daily={{ kind: "trip", trip, graph }}
      storage={storage}
      sessionStorage={sessionStorage}
      now={new Date(2026, 9, 21, 13, 5, 9)}
    />
  );
}

/** A session in which the player last picked `tab`, or collapsed today's result. */
function sessionWith(key: "akle:result-tab" | "akle:result-closed", value: unknown) {
  const sessionStorage = memoryStorage();
  sessionStorage.setItem(key, JSON.stringify(value));
  return sessionStorage;
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

  test.each(["shortest", "stats"])(
    "the result view on the %s tab has no serious violations",
    async (tab) => {
      const session = sessionWith("akle:result-tab", tab);
      expect(await seriousViolations(playScreen(["0181"], 0, session))).toEqual([]);
    },
  );

  test("the collapsed result over the board has no serious violations", async () => {
    const session = sessionWith("akle:result-closed", trip.number);
    expect(await seriousViolations(playScreen(["0181"], 0, session))).toEqual([]);
  });

  test("the Fri resa setup screen has no serious violations", async () => {
    const setup = (
      <FreePlayScreen
        graph={graph}
        ordinal={0}
        storage={memoryStorage()}
        sessionStorage={memoryStorage()}
      />
    );
    expect(await seriousViolations(setup)).toEqual([]);
  });

  test.each([
    ["naming its trip", { start: "Nynäshamn", destination: "Haninge" }],
    ["naming no trip", undefined],
  ])("the free-play error screen %s has no serious violations", async (_, named) => {
    expect(await seriousViolations(<FreePlayLinkError trip={named} />)).toEqual([]);
  });

  test("a Start field with its suggestions open has no serious violations", async () => {
    const field = (
      <EndpointField
        id="free-play-start"
        label="Start"
        end="start"
        text="s"
        suggestions={[
          { code: "0181", name: "Södertälje" },
          { code: "0192", name: "Nynäshamn", disabled: "granne" },
        ]}
        onTextChange={() => {}}
      />
    );
    expect(await seriousViolations(field)).toEqual([]);
  });
});
