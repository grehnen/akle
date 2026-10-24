import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import type { Root } from "react-dom/client";
import { App } from "./App";
import type { DailyTripSource } from "./daily/loadDailyTrip";
import { itineraryLinkPath } from "./freePlay/itineraryLink";
import { encodeLinkPayload, type LinkedTrip } from "./freePlay/linkPayload";
import type { GraphVersionFiles } from "./graph/graphVersionFiles";
import { type KeyValueStorage, memoryStorage } from "./progress/storage";

const dom = new JSDOM('<!doctype html><html lang="sv"><body></body></html>', {
  url: "https://akle.example/",
});
// The satellite map asks for the touch-screen media query; jsdom has no matchMedia.
const matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
Object.assign(dom.window, { matchMedia });
// jsdom has no modal dialogs: opening one only marks it open, and closing it fires close.
Object.assign(dom.window.HTMLDialogElement.prototype, {
  showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  },
  close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new dom.window.Event("close"));
  },
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  IS_REACT_ACT_ENVIRONMENT: true,
});
// Imported only now: react-dom checks for a DOM once, when it loads, to pick its event handling.
const { createRoot } = await import("react-dom/client");
// What the share button copies.
const copied: string[] = [];
Object.defineProperty(globalThis.navigator, "clipboard", {
  configurable: true,
  value: { writeText: async (text: string) => void copied.push(text) },
});
afterAll(() => {
  for (const name of ["window", "document", "IS_REACT_ACT_ENVIRONMENT"]) {
    Reflect.deleteProperty(globalThis, name);
  }
  Reflect.deleteProperty(globalThis.navigator, "clipboard");
});

// Nynäshamn ── Haninge ── Salem ── Trosa.
const currentFiles: GraphVersionFiles = {
  version: { id: "current", startsAtTrip: 1 },
  kommuner: "code,name\n0192,Nynäshamn\n0136,Haninge\n0128,Salem\n0488,Trosa\n",
  neighbors: "a,b,link\n0192,0136,land\n0136,0128,land\n0128,0488,land\n",
  shapes: { type: "FeatureCollection", features: [] },
};

/**
 * Launch is 2026-11-01 and the tests run before it, on trip #1's version "current", ordinal 0;
 * "later" starts at trip #500 and can't be loaded.
 */
const source: DailyTripSource = {
  scheduleConfig: async () => ({
    epoch: "2026-11-01",
    seed: "test",
    cooldownDays: 30,
    cooldownDaysByGraphVersion: {},
    lanCooldownDays: 3,
    lanCooldownDaysByGraphVersion: {},
  }),
  scheduleChunk: async () => undefined,
  graphVersions: async () => [
    { id: "later", startsAtTrip: 500 },
    { id: "current", startsAtTrip: 1 },
  ],
  graphVersionFiles: async (id) => {
    if (id !== "current") throw new Error(`no files for ${id}`);
    return currentFiles;
  },
};

/** A storage that records every write, holding some daily progress already. */
function dailyProgress() {
  const storage = memoryStorage();
  storage.setItem("akle:game", JSON.stringify({ tripNumber: 3, guesses: ["0136"] }));
  storage.setItem("akle:history", JSON.stringify({ 2: { won: true, extra: 0, perfect: true } }));
  storage.setItem("akle:free-play-trip", "a stored trip");
  const writes: string[] = [];
  const recording: KeyValueStorage = {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => {
      writes.push(key);
      storage.setItem(key, value);
    },
    removeItem: (key) => {
      writes.push(key);
      storage.removeItem(key);
    },
  };
  return { storage: recording, writes };
}

const OPENED_AT = new Date(2026, 9, 24, 12, 0).getTime();
/** The app's clock, which a test moves on to let real time pass. */
let clockTime = OPENED_AT;

let mounted: { root: Root; container: HTMLElement } | undefined;

afterEach(() => {
  clockTime = OPENED_AT;
  copied.length = 0;
  if (!mounted) return;
  const { root, container } = mounted;
  act(() => root.unmount());
  container.remove();
  mounted = undefined;
  dom.window.history.replaceState(null, "", "/");
});

async function mountApp(path: string, storage: KeyValueStorage = memoryStorage()) {
  dom.window.history.replaceState(null, "", path);
  const { pathname, search } = dom.window.location;
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  mounted = { root, container };
  await act(async () =>
    root.render(
      <App
        source={source}
        now={() => new Date(clockTime)}
        storage={storage}
        sessionStorage={memoryStorage()}
        path={pathname}
        search={search}
      />,
    ),
  );
  // The pinned version loads after the first render.
  await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
  return container;
}

const query = <E extends Element = HTMLElement>(container: HTMLElement, selector: string) =>
  container.querySelector(selector) as E;
const text = (container: HTMLElement, selector: string) =>
  query(container, selector)?.textContent ?? undefined;
const button = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll("button")].find(
    (element) => element.textContent?.trim() === label,
  ) as HTMLButtonElement | undefined;

async function click(element: Element | undefined) {
  if (element === undefined) throw new Error("nothing to click");
  await act(async () => (element as HTMLElement).click());
}

async function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value");
  await act(async () => {
    setValue?.set?.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

async function guess(container: HTMLElement, name: string) {
  await type(query<HTMLInputElement>(container, "#guess-input"), name);
  await click(query(container, '.guess-input button[type="submit"]'));
}

/** The summary's rows, each field by its class; a field a trip doesn't have is undefined. */
const summaryRows = (container: HTMLElement) =>
  [...container.querySelectorAll(".itinerary-summary-trip")].map((row) => {
    const field = (name: string) =>
      row.querySelector(`.itinerary-summary-${name}`)?.textContent ?? undefined;
    return {
      pair: field("pair"),
      mode: field("mode"),
      outcome: field("outcome"),
      hints: field("hints"),
      timeouts:
        row.querySelector(".itinerary-summary-timeouts [aria-hidden]")?.textContent ?? undefined,
      time: field("time"),
      score: field("score"),
    };
  });

/** A finished trip keeps the board up for a moment before the result view opens. */
const linger = () => act(async () => new Promise((resolve) => setTimeout(resolve, 1600)));

const trip = (start: string, destination: string, mode: LinkedTrip["mode"]): LinkedTrip => ({
  start,
  destination,
  mode,
});
// Nynäshamn → Salem and Haninge → Trosa are both at distance 1.
const nynashamnSalem = trip("0192", "0128", { kind: "standard" });
const haningeTrosa = trip("0136", "0488", { kind: "timed", thinkingTime: 10 });
const trosaHaninge = trip("0488", "0136", { kind: "tie-breaker" });
const fridayLink = itineraryLinkPath(0, "Fredagsresan", [
  nynashamnSalem,
  haningeTrosa,
  trosaHaninge,
]);

describe("an itinerary from its link", () => {
  test("opens on its intro: the title, the number of trips and each trip's mode, ends hidden", async () => {
    const container = await mountApp(fridayLink);

    expect(text(container, "#itinerary-intro-heading")).toBe("Fredagsresan");
    expect(text(container, ".itinerary-intro-count")).toBe("3 resor");
    expect(
      [...container.querySelectorAll(".itinerary-intro-trips li")].map((li) => li.textContent),
    ).toEqual(["Standard", "Tidspress 10 s", "Tidtagning"]);
    expect(container.textContent).not.toContain("Nynäshamn");
    expect(container.querySelector("#guess-input")).toBeNull();
    expect(button(container, "Starta resplanen")).toBeDefined();
  });

  test("without a title the intro is headed Resplan", async () => {
    const container = await mountApp(itineraryLinkPath(0, "", [nynashamnSalem, haningeTrosa]));
    expect(text(container, "#itinerary-intro-heading")).toBe("Resplan");
    expect(text(container, ".itinerary-intro-count")).toBe("2 resor");
  });

  test("plays through a card and a trip for each, to a total score", async () => {
    const container = await mountApp(fridayLink);
    await click(button(container, "Starta resplanen"));

    // Trip 1: a card, then the board under Standard.
    expect(text(container, ".start-gate .trip-number")).toBe("Resa 1 av 3 · Standard");
    expect(container.textContent).not.toContain("Nynäshamn");
    // A trip off the clock has no time to warn about.
    expect(container.textContent).not.toContain("Tiden går");
    await click(button(container, "Starta"));
    expect(text(container, ".trip-number")).toBe("Resa 1 av 3 · Standard");
    expect(text(container, "#trip-heading")).toContain("Nynäshamn");
    expect(container.querySelector(".thinking-time")).toBeNull();
    // No way past a trip being played but to finish it.
    expect(button(container, "Nästa resa")).toBeUndefined();
    await guess(container, "Haninge");
    await linger();

    // Trip end: the result with the shortest route, the trip's score and the running total.
    expect(text(container, "#result-heading")).toBe("Perfekt!");
    expect(container.textContent).toContain("Kortaste rutt");
    expect(text(container, ".result-score")).toBe("−1 poäng");
    expect(text(container, ".itinerary-total")).toBe("Totalt −1 poäng");
    expect(container.querySelector(".share-button")).toBeNull();
    await click(button(container, "Nästa resa"));

    // Trip 2: Tidspress, its thinking time running from Starta.
    expect(text(container, ".start-gate .trip-number")).toBe("Resa 2 av 3 · Tidspress 10 s");
    expect(container.textContent).toContain("Tiden går även om du lämnar sidan.");
    await click(button(container, "Starta"));
    expect(container.querySelector(".thinking-time")).not.toBeNull();
    // 25 s on one guess: two timeouts, +0 and 2 ⏱ = 2.
    clockTime += 25_000;
    await guess(container, "Salem");
    await linger();
    expect(text(container, ".result-score")).toBe("2 poäng");
    expect(text(container, ".itinerary-total")).toBe("Totalt 1 poäng");
    await click(button(container, "Nästa resa"));

    // Trip 3: Tidtagning, its clock on the board, given up after a wrong guess: 1 − 1 + 3·1.
    expect(text(container, ".start-gate .trip-number")).toBe("Resa 3 av 3 · Tidtagning");
    await click(button(container, "Starta"));
    expect(container.querySelector(".trip-clock")).not.toBeNull();
    await guess(container, "Nynäshamn");
    await click(query(container, ".give-up-button"));
    await click(query(container, "dialog.give-up-dialog .give-up-confirm"));
    await linger();
    expect(text(container, "#result-heading")).toBe("Gav upp (1 ifrån)");
    expect(text(container, ".result-score")).toBe("3 poäng");
    expect(text(container, ".itinerary-total")).toBe("Totalt 4 poäng");
    expect(container.querySelector(".share-button")).toBeNull();
    expect(button(container, "Nästa resa")).toBeUndefined();
    await click(button(container, "Avsluta resplanen"));

    // The summary: the title, then a row per trip with all it has.
    expect(text(container, "#itinerary-summary-heading")).toBe("Fredagsresan");
    expect(summaryRows(container)).toEqual([
      {
        pair: "Nynäshamn → Salem",
        mode: "Standard",
        outcome: "Perfekt",
        hints: "0 ledtrådar",
        timeouts: undefined,
        time: undefined,
        score: "−1 poäng",
      },
      {
        pair: "Haninge → Trosa",
        mode: "Tidspress 10 s",
        outcome: "+0",
        hints: "0 ledtrådar",
        timeouts: "2 ⏱",
        time: undefined,
        score: "2 poäng",
      },
      {
        pair: "Trosa → Haninge",
        mode: "Tidtagning",
        outcome: "Gav upp, 1 ifrån",
        hints: "0 ledtrådar",
        timeouts: undefined,
        time: undefined,
        score: "3 poäng",
      },
    ]);
    expect(text(container, ".itinerary-summary-total")).toBe("Totalt 4 poäng");
    // A tie-breaker trip, lost: the total time is there, with nothing won.
    expect(text(container, ".itinerary-summary-total-time")).toBe("Total tid 0:00,0 (0 vunna)");
    expect(button(container, "Nästa resa")).toBeUndefined();
    expect(button(container, "Spela igen")).toBeUndefined();

    await click(query(container, ".itinerary-summary .share-button"));
    expect(copied).toEqual([
      [
        "#åkle Resplan · Fredagsresan · 3 resor",
        "Totalt 4 poäng · 0:00,0 (0 vunna)",
        "1. Standard · +0 (Perfekt) · −1 poäng",
        "2. Tidspress 10 s · +0 (2 ⏱) · 2 poäng",
        "3. Tidtagning · Gav upp (1 ifrån) · 3 poäng",
        `https://akle.grehn.net${fridayLink}`,
      ].join("\n"),
    ]);
  });

  test("sums the won tie-breaker trips' time, shows each one's time, and shares it all", async () => {
    const link = itineraryLinkPath(0, "", [trosaHaninge, nynashamnSalem]);
    const container = await mountApp(link);
    await click(button(container, "Starta resplanen"));
    await click(button(container, "Starta"));
    clockTime += 12_340;
    await guess(container, "Salem");
    await linger();
    await click(button(container, "Nästa resa"));
    await click(button(container, "Starta"));
    await click(query(container, ".hint-button"));
    await guess(container, "Haninge");
    await linger();
    await click(button(container, "Avsluta resplanen"));

    expect(text(container, "#itinerary-summary-heading")).toBe("Resplan");
    expect(
      summaryRows(container).map(({ outcome, hints, time, score }) => ({
        outcome,
        hints,
        time,
        score,
      })),
    ).toEqual([
      { outcome: "Perfekt", hints: "0 ledtrådar", time: "0:12,3", score: "−1 poäng" },
      { outcome: "+0", hints: "1 ledtråd", time: undefined, score: "1 poäng" },
    ]);
    expect(text(container, ".itinerary-summary-total")).toBe("Totalt 0 poäng");
    expect(text(container, ".itinerary-summary-total-time")).toBe("Total tid 0:12,3 (1 vunnen)");

    await click(query(container, ".itinerary-summary .share-button"));
    expect(copied).toEqual([
      [
        "#åkle Resplan · 2 resor",
        "Totalt 0 poäng · 0:12,3 (1 vunnen)",
        "1. Tidtagning · +0 (Perfekt) · −1 poäng · 0:12,3",
        "2. Standard · +0 (1 ledtråd) · 1 poäng",
        `https://akle.grehn.net${link}`,
      ].join("\n"),
    ]);
  });

  test("the summary shows no total time without a tie-breaker trip, and leads to today's trip and free play", async () => {
    const container = await mountApp(itineraryLinkPath(0, "", [nynashamnSalem, haningeTrosa]));
    await click(button(container, "Starta resplanen"));
    await click(button(container, "Starta"));
    await guess(container, "Haninge");
    await linger();
    await click(button(container, "Nästa resa"));
    await click(button(container, "Starta"));
    await guess(container, "Salem");
    await linger();
    await click(button(container, "Avsluta resplanen"));

    expect(text(container, ".itinerary-summary-total")).toBe("Totalt −2 poäng");
    expect(container.querySelector(".itinerary-summary-total-time")).toBeNull();
    expect(
      [...container.querySelectorAll(".itinerary-summary-actions a")].map((a) => [
        a.textContent,
        a.getAttribute("href"),
      ]),
    ).toEqual([
      ["Dagens resa", "/"],
      ["Fri resa", "/fri"],
    ]);
  });

  test("offers no retry: a finished trip's result has no way to play it again", async () => {
    const container = await mountApp(fridayLink);
    await click(button(container, "Starta resplanen"));
    await click(button(container, "Starta"));
    await guess(container, "Haninge");
    await linger();
    const labels = [...container.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(labels).not.toContain("Starta");
    expect(labels).not.toContain("Slumpa ny resa");
    expect(container.querySelector("#guess-input")).toBeNull();
  });

  test("leaves the trip slot, streak, stats and history untouched", async () => {
    const { storage, writes } = dailyProgress();
    const container = await mountApp(
      itineraryLinkPath(0, "", [nynashamnSalem, haningeTrosa]),
      storage,
    );
    await click(button(container, "Starta resplanen"));
    await click(button(container, "Starta"));
    await guess(container, "Haninge");
    await linger();
    await click(button(container, "Nästa resa"));
    await click(button(container, "Starta"));
    await guess(container, "Salem");
    await linger();
    await click(button(container, "Avsluta resplanen"));

    expect(writes).toEqual([]);
    expect(storage.getItem("akle:free-play-trip")).toBe("a stored trip");
  });
});

describe("an invalid itinerary link", () => {
  const page = (title: string | undefined, payload: string) => {
    const params = new URLSearchParams();
    if (title !== undefined) params.set("namn", title);
    params.set("r", payload);
    return `/resplan?${params}`;
  };
  const packed = (versionOrdinal: number, ...trips: LinkedTrip[]) =>
    encodeLinkPayload({ versionOrdinal, trips });

  test.each([
    ["a bad checksum", page(undefined, `${packed(0, nynashamnSalem, haningeTrosa).slice(0, -1)}A`)],
    [
      "an unknown format version",
      page(undefined, `I${packed(0, nynashamnSalem, haningeTrosa).slice(1)}`),
    ],
    ["one trip", page(undefined, packed(0, nynashamnSalem))],
    ["an ordinal no started version has", page(undefined, packed(1, nynashamnSalem, haningeTrosa))],
    [
      "an unknown code",
      page(undefined, packed(0, nynashamnSalem, trip("0192", "0999", { kind: "standard" }))),
    ],
    ["a title over 40 characters", page("x".repeat(41), packed(0, nynashamnSalem, haningeTrosa))],
  ])("with %s shows the error screen, naming no trip", async (_, path) => {
    const container = await mountApp(path);
    expect(text(container, "#free-play-error-heading")).toBe("Länken fungerar inte");
    expect(text(container, ".free-play-error p")).toBe(
      "Länken till resplanen är trasig eller ogiltig.",
    );
    expect(
      [...container.querySelectorAll(".free-play-error-actions a")].map((a) => [
        a.textContent,
        a.getAttribute("href"),
      ]),
    ).toEqual([
      ["Dagens resa", "/"],
      ["Fri resa", "/fri"],
    ]);
    expect(button(container, "Starta resplanen")).toBeUndefined();
  });

  test.each([
    [
      "the same start and destination",
      trip("0128", "0128", { kind: "standard" }),
      "Salem",
      "Salem",
    ],
    ["neighbors", trip("0128", "0488", { kind: "unlimited" }), "Salem", "Trosa"],
  ])("with %s names the trip", async (_, bad, start, destination) => {
    const container = await mountApp(page("Fredag", packed(0, nynashamnSalem, bad)));
    expect(text(container, ".free-play-error p")).toBe(
      `Resan från ${start} till ${destination} i länken kan inte spelas.`,
    );
  });
});
