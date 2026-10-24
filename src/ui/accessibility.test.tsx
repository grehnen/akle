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
import { ItineraryBuilder } from "./ItineraryBuilder";
import { ItineraryScreen } from "./ItineraryScreen";
import { ItinerarySummaryView } from "./ItinerarySummary";
import { ModeCards } from "./ModeCards";

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

  const tieBreakerTrip = {
    start: "0192",
    destination: "0488",
    mode: { kind: "tie-breaker" },
  } as const;

  test("a tie-breaker trip behind its Starta gate has no serious violations", async () => {
    const gate = (
      <FreePlayScreen
        graph={graph}
        ordinal={0}
        linkedTrip={tieBreakerTrip}
        storage={memoryStorage()}
        sessionStorage={memoryStorage()}
      />
    );
    expect(await seriousViolations(gate)).toEqual([]);
  });

  test("a started tie-breaker trip with its clock has no serious violations", async () => {
    const rules = { guessLimit: "distance", giveUp: true, keepsTime: true } as const;
    const game = { trip: tieBreakerTrip, rules, guesses: [], startedAt: 0 };
    const board = (
      <FreePlayScreen
        graph={graph}
        ordinal={0}
        linkedTrip={tieBreakerTrip}
        resumed={{ game, drawn: false }}
        storage={memoryStorage()}
        sessionStorage={memoryStorage()}
        clock={() => 83_000}
      />
    );
    expect(await seriousViolations(board)).toEqual([]);
  });

  test("a timed trip in its warning third, after timeouts, has no serious violations", async () => {
    const timedTrip = {
      start: "0192",
      destination: "0488",
      mode: { kind: "timed", thinkingTime: 10 },
    } as const;
    const rules = {
      guessLimit: "distance",
      giveUp: true,
      keepsTime: false,
      thinkingTime: 10,
    } as const;
    const game = { trip: timedTrip, rules, guesses: [], startedAt: 0 } as const;
    const board = (
      <FreePlayScreen
        graph={graph}
        ordinal={0}
        linkedTrip={timedTrip}
        resumed={{ game, drawn: false }}
        storage={memoryStorage()}
        sessionStorage={memoryStorage()}
        clock={() => 27_500}
      />
    );
    expect(await seriousViolations(board)).toEqual([]);
  });

  test("the Tidspress card with its betänketid has no serious violations", async () => {
    const cards = (
      <ModeCards mode={{ kind: "timed", thinkingTime: 10 }} thinkingTime={10} onChange={() => {}} />
    );
    expect(await seriousViolations(cards)).toEqual([]);
  });

  test.each([
    ["naming its trip", { start: "Nynäshamn", destination: "Haninge" }],
    ["naming no trip", undefined],
  ])("the free-play error screen %s has no serious violations", async (_, named) => {
    expect(await seriousViolations(<FreePlayLinkError trip={named} />)).toEqual([]);
  });

  test("the itinerary builder has no serious violations", async () => {
    const builder = <ItineraryBuilder graph={graph} ordinal={0} onPlay={() => {}} />;
    expect(await seriousViolations(builder)).toEqual([]);
  });

  test("the itinerary builder with its resume banner has no serious violations", async () => {
    const banner = (
      <a className="itinerary-resume" href="/resplan?namn=Fredag&r=x">
        Fortsätt resplanen: Fredag, resa 3 av 8
      </a>
    );
    const builder = (
      <ItineraryBuilder graph={graph} ordinal={0} onPlay={() => {}} banner={banner} />
    );
    expect(await seriousViolations(builder)).toEqual([]);
  });

  test("an itinerary's intro has no serious violations", async () => {
    const intro = (
      <ItineraryScreen
        graph={graph}
        title="Fredagsresan"
        trips={[
          { start: "0192", destination: "0488", mode: { kind: "standard" } },
          { start: "0488", destination: "0192", mode: { kind: "timed", thinkingTime: 10 } },
        ]}
        link="/resplan?namn=Fredagsresan&r=EIYFoKAAoAUMXhQwBgdq"
        sessionStorage={memoryStorage()}
      />
    );
    expect(await seriousViolations(intro)).toEqual([]);
  });

  test("an itinerary's summary has no serious violations", async () => {
    const row = {
      start: "Nynäshamn",
      destination: "Trosa",
      hintsUsed: 1,
      timeouts: 2,
      score: 4,
    };
    const summary = (
      <ItinerarySummaryView
        title="Fredagsresan"
        summary={{
          rows: [
            {
              ...row,
              mode: { kind: "timed", thinkingTime: 10 },
              outcome: { kind: "won", extra: 1, hintsUsed: 1, timeouts: 2 },
            },
            {
              ...row,
              mode: { kind: "tie-breaker" },
              outcome: { kind: "perfect", extra: 0 },
              timeouts: 0,
              score: -1,
              time: 834,
            },
          ],
          standing: { score: 3, wonTieBreakers: 1, totalTime: 834 },
          hasTieBreaker: true,
        }}
        link="/resplan?namn=Fredagsresan&r=EIYFoKAAoAUMXhQwBgdq"
      />
    );
    expect(await seriousViolations(summary)).toEqual([]);
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
