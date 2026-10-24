import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import type { Root } from "react-dom/client";
import { App } from "./App";
import type { DailyTripSource } from "./daily/loadDailyTrip";
import { tripLinkPath } from "./freePlay/tripLink";
import type { GraphVersionFiles } from "./graph/graphVersionFiles";
import { type KeyValueStorage, memoryStorage } from "./progress/storage";

const dom = new JSDOM('<!doctype html><html lang="sv"><body></body></html>', {
  url: "https://akle.example/",
});
// The satellite map asks for the touch-screen media query; jsdom has no matchMedia.
const matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
Object.assign(dom.window, { matchMedia });
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
 * Launch is 2026-11-01 and the tests run before it, on trip #1's version "current"; "later"
 * starts at trip #500 and can't be loaded. The schedule has no trips.
 */
function fakeSource() {
  const fetched: string[] = [];
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
      fetched.push(id);
      if (id !== "current") throw new Error(`no files for ${id}`);
      return currentFiles;
    },
  };
  return { source, fetched };
}

/** A storage that records every write, holding some daily progress already. */
function dailyProgress() {
  const storage = memoryStorage();
  const savedGame = JSON.stringify({ tripNumber: 3, guesses: ["0136"] });
  const history = JSON.stringify({
    2: { won: true, extra: 0, perfect: true, hintsUsed: 0, emojiLine: "✅" },
  });
  storage.setItem("akle:game", savedGame);
  storage.setItem("akle:history", history);
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
  return { storage: recording, writes, savedGame, history };
}

let mounted: { root: Root; container: HTMLElement } | undefined;

afterEach(() => {
  if (!mounted) return;
  const { root, container } = mounted;
  act(() => root.unmount());
  container.remove();
  mounted = undefined;
  copied.length = 0;
  dom.window.history.replaceState(null, "", "/");
});

async function mountApp(path: string, storage: KeyValueStorage = memoryStorage()) {
  dom.window.history.replaceState(null, "", path);
  const { pathname, search } = dom.window.location;
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  mounted = { root, container };
  const { source, fetched } = fakeSource();
  await act(async () =>
    root.render(
      <App
        source={source}
        now={() => new Date(2026, 9, 24, 12, 0)}
        storage={storage}
        sessionStorage={memoryStorage()}
        path={pathname}
        search={search}
      />,
    ),
  );
  return { container, fetched };
}

const query = <E extends Element = HTMLElement>(container: HTMLElement, selector: string) =>
  container.querySelector(selector) as E;

async function type(input: HTMLInputElement, text: string) {
  const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value");
  await act(async () => {
    setValue?.set?.call(input, text);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

async function click(element: Element) {
  await act(async () => (element as HTMLElement).click());
}

const startField = (container: HTMLElement) =>
  query<HTMLInputElement>(container, "#free-play-start");
const destinationField = (container: HTMLElement) =>
  query<HTMLInputElement>(container, "#free-play-destination");
const resButton = (container: HTMLElement) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent === "Res") as HTMLElement;

/** Each option of a field's open list, as its text and whether it's disabled. */
function options(container: HTMLElement, field: string) {
  return [...container.querySelectorAll(`#${field}-suggestions [role="option"]`)].map((option) => [
    option.textContent,
    option.getAttribute("aria-disabled") === "true",
  ]);
}

describe("getting to free play", () => {
  test("the header's 🎲 opens Fri resa, and Back returns to today's trip", async () => {
    const { container } = await mountApp("/");
    expect(container.textContent).not.toContain("Fri resa");

    await click(query(container, 'header a[aria-label="Fri resa"]'));
    expect(dom.window.location.pathname).toBe("/fri");
    expect(query(container, "#free-play-heading").textContent).toBe("Fri resa");
    expect(dom.window.document.title).toBe("Åkle – Fri resa");

    await act(async () => {
      dom.window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(dom.window.location.pathname).toBe("/");
    expect(container.querySelector("#free-play-heading")).toBeNull();
    expect(query(container, "h1").innerHTML).toBe("Åkle");
  });

  test("in free play the title links back to today's trip", async () => {
    const { container } = await mountApp("/fri");

    await click(query(container, "h1 a"));
    expect(dom.window.location.pathname).toBe("/");
    expect(container.querySelector("#free-play-heading")).toBeNull();
  });
});

describe("Välj själv", () => {
  test("tags the other end samma and its neighbors granne, and disables them", async () => {
    const { container } = await mountApp("/fri");

    await type(startField(container), "Haninge");
    await type(destinationField(container), "n");
    expect(options(container, "free-play-destination")).toEqual([
      ["Nynäshamngranne", true],
      ["Haningesamma", true],
    ]);
    expect(resButton(container).hasAttribute("disabled")).toBe(true);
  });

  test("picks by name or SCB code, shows the distance and only then enables Res", async () => {
    const { container } = await mountApp("/fri");
    expect(resButton(container).hasAttribute("disabled")).toBe(true);

    await type(startField(container), "0192");
    expect(resButton(container).hasAttribute("disabled")).toBe(true);
    expect(query(container, ".free-play-distance").textContent).toBe("");

    await type(destinationField(container), "Tro");
    await click(query(container, '#free-play-destination-suggestions [role="option"]'));
    expect(destinationField(container).value).toBe("Trosa");
    expect(query(container, ".free-play-distance").textContent).toBe("Avstånd 2");
    expect(resButton(container).hasAttribute("disabled")).toBe(false);
  });

  test("a neighbor typed in full keeps Res disabled", async () => {
    const { container } = await mountApp("/fri");

    await type(startField(container), "Salem");
    await type(destinationField(container), "Trosa");
    expect(query(container, ".free-play-distance").textContent).not.toContain("Avstånd");
    expect(container.textContent).toContain("Start och mål är grannar.");
    expect(resButton(container).hasAttribute("disabled")).toBe(true);
  });
});

describe("playing a picked trip", () => {
  test("plays on trip #1's version before launch, shows the score, and keeps daily progress as it was", async () => {
    const progress = dailyProgress();
    const { container, fetched } = await mountApp("/fri", progress.storage);

    await type(startField(container), "Nynäshamn");
    await type(destinationField(container), "Trosa");
    await click(resButton(container));
    expect(query(container, "#trip-heading").textContent).toBe("Res från Nynäshamn till Trosa");
    expect(container.textContent).toContain("Fri resa · Standard");

    for (const name of ["Haninge", "Salem"]) {
      await type(query<HTMLInputElement>(container, "#guess-input"), name);
      await click(query(container, '.guess-input button[type="submit"]'));
    }
    // A finished game keeps the board up for a moment before the result view opens.
    await act(async () => new Promise((resolve) => setTimeout(resolve, 1600)));

    expect(query(container, "#result-heading").textContent).toBe("Perfekt!");
    expect(query(container, ".result-score").textContent).toBe("−1 poäng");
    expect(fetched).toEqual(["current"]);
    expect(new Set(progress.writes)).toEqual(new Set(["akle:free-play-trip"]));
    expect(progress.storage.getItem("akle:game")).toBe(progress.savedGame);
    expect(progress.storage.getItem("akle:history")).toBe(progress.history);
  });
});

const buttonNamed = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text)) as
    | HTMLElement
    | undefined;
const distanceThumbs = (container: HTMLElement) => ({
  min: query<HTMLInputElement>(container, 'input[aria-label="Minsta avstånd"]'),
  max: query<HTMLInputElement>(container, 'input[aria-label="Största avstånd"]'),
});
const KOMMUN_NAMES = ["Nynäshamn", "Haninge", "Salem", "Trosa"];
const pairIn = (heading: string) => KOMMUN_NAMES.filter((name) => heading.includes(name));

/** Wins a trip at distance 1 by guessing the kommun between its ends; returns its heading. */
async function winDistanceOneTrip(container: HTMLElement) {
  const heading = query(container, "#trip-heading").textContent ?? "";
  const between = heading.includes("Nynäshamn") ? "Haninge" : "Salem";
  await type(query<HTMLInputElement>(container, "#guess-input"), between);
  await click(query(container, '.guess-input button[type="submit"]'));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 1600)));
  return heading;
}

describe("Slumpa", () => {
  test("is the open tab, with a distance slider from 1 to the version's largest distance", async () => {
    const { container } = await mountApp("/fri");

    expect(query(container, "#free-play-tab-draw").getAttribute("aria-selected")).toBe("true");
    expect(query(container, "#free-play-panel-draw").hidden).toBe(false);
    expect(query(container, "#free-play-panel-pick").hidden).toBe(true);
    const { min, max } = distanceThumbs(container);
    expect([min.min, min.max, max.min, max.max]).toEqual(["1", "2", "1", "2"]);
    // 3–8 by default, cut down to this version's largest distance, 2.
    expect([min.value, max.value]).toEqual(["2", "2"]);
    expect(query(container, ".free-play-range-label").textContent).toBe("Avstånd 2");
    expect(container.textContent).toContain("Start och mål visas när resan börjar.");
  });

  test("the distance label follows the thumbs", async () => {
    const { container } = await mountApp("/fri");

    await type(distanceThumbs(container).min, "1");
    expect(query(container, ".free-play-range-label").textContent).toBe("Avstånd 1–2");
  });

  test("Välj själv shows its panel instead", async () => {
    const { container } = await mountApp("/fri");

    await click(query(container, "#free-play-tab-pick"));
    expect(query(container, "#free-play-tab-pick").getAttribute("aria-selected")).toBe("true");
    expect(query(container, "#free-play-panel-pick").hidden).toBe(false);
    expect(query(container, "#free-play-panel-draw").hidden).toBe(true);
  });

  test("starts the drawn trip at once, never showing its pair before", async () => {
    const { container } = await mountApp("/fri");
    expect(pairIn(query(container, ".free-play-setup").textContent ?? "")).toEqual([]);

    await click(buttonNamed(container, "Slumpa resa") as HTMLElement);
    // The only pair at distance 2.
    expect(pairIn(query(container, "#trip-heading").textContent ?? "")).toEqual([
      "Nynäshamn",
      "Trosa",
    ]);
    expect(container.textContent).toContain("Fri resa · Standard");
  });

  test("Slumpa ny resa keeps the range and draws the other pair", async () => {
    const { container } = await mountApp("/fri");
    const { min, max } = distanceThumbs(container);
    await type(min, "1");
    await type(max, "1");

    await click(buttonNamed(container, "Slumpa resa") as HTMLElement);
    const first = await winDistanceOneTrip(container);
    await click(buttonNamed(container, "Slumpa ny resa") as HTMLElement);
    const second = await winDistanceOneTrip(container);

    // Distance 1 has two pairs: Nynäshamn–Salem and Haninge–Trosa.
    expect(pairIn(first)).toHaveLength(2);
    expect(pairIn(second)).toHaveLength(2);
    expect(pairIn(second)).not.toEqual(pairIn(first));
    expect(query(container, "#result-heading").textContent).toBe("Perfekt!");
    expect(buttonNamed(container, "Slumpa ny resa")).toBeDefined();
  });

  test("a picked trip offers no Slumpa ny resa", async () => {
    const { container } = await mountApp("/fri");

    await click(query(container, "#free-play-tab-pick"));
    await type(startField(container), "Nynäshamn");
    await type(destinationField(container), "Salem");
    await click(resButton(container));
    await winDistanceOneTrip(container);
    expect(query(container, "#result-heading").textContent).toBe("Perfekt!");
    expect(buttonNamed(container, "Slumpa ny resa")).toBeUndefined();
  });
});

const address = () => dom.window.location.pathname + dom.window.location.search;

async function playToTheEnd(container: HTMLElement, ...names: string[]) {
  for (const name of names) {
    await type(query<HTMLInputElement>(container, "#guess-input"), name);
    await click(query(container, '.guess-input button[type="submit"]'));
  }
  // A finished game keeps the board up for a moment before the result view opens.
  await act(async () => new Promise((resolve) => setTimeout(resolve, 1600)));
}

describe("trip links", () => {
  const nynashamnTrosa = tripLinkPath(0, {
    start: "0192",
    destination: "0488",
    mode: { kind: "standard" },
  });

  test("a picked trip shows its link while played", async () => {
    const { container } = await mountApp("/fri");
    await type(startField(container), "Nynäshamn");
    await type(destinationField(container), "Trosa");
    await click(resButton(container));
    expect(address()).toBe(nynashamnTrosa);
  });

  test("the share text of a finished trip ends with the link in the address bar", async () => {
    const { container } = await mountApp("/fri");
    await type(startField(container), "Nynäshamn");
    await type(destinationField(container), "Trosa");
    await click(resButton(container));
    await playToTheEnd(container, "Haninge", "Salem");

    await click(query(container, ".share-button"));
    expect(copied).toEqual([
      `#åkle Fri resa · Standard\n+0 (Perfekt) · −1 poäng\n✅✅\nhttps://akle.grehn.net${address()}`,
    ]);
    expect(address()).toBe(nynashamnTrosa);
  });

  test("/fri?r=… opens straight on the trip, showing just its link", async () => {
    const { container, fetched } = await mountApp(`${nynashamnTrosa}&utm_source=chat`);
    expect(query(container, "#trip-heading").textContent).toBe("Res från Nynäshamn till Trosa");
    expect(container.textContent).toContain("Fri resa · Standard");
    expect(address()).toBe(nynashamnTrosa);
    expect(fetched).toEqual(["current"]);
  });

  test.each([
    ["a garbled payload", "/fri?r=EAIFoKICI"],
    [
      "a version that hasn't started",
      tripLinkPath(1, { start: "0192", destination: "0488", mode: { kind: "standard" } }),
    ],
    ["two trips", "/fri?r=EIYFoKAAoAUMXhQwBgdq"],
  ])("%s shows the free-play error screen, never a fallback", async (_, link) => {
    const { container } = await mountApp(link);
    expect(query(container, "#free-play-error-heading").textContent).toBe("Länken fungerar inte");
    expect(container.querySelector("#trip-heading")).toBeNull();
    expect(container.querySelector("#free-play-heading")).toBeNull();
    const links = [...container.querySelectorAll(".free-play-error a")].map((anchor) => [
      anchor.textContent,
      anchor.getAttribute("href"),
    ]);
    expect(links).toEqual([
      ["Dagens resa", "/"],
      ["Fri resa", "/fri"],
    ]);
  });

  test("an invalid link names its trip when it can", async () => {
    const neighbors = tripLinkPath(0, {
      start: "0136",
      destination: "0128",
      mode: { kind: "standard" },
    });
    const { container } = await mountApp(neighbors);
    expect(query(container, ".free-play-error").textContent).toContain(
      "Resan från Haninge till Salem",
    );
  });
});

/** Unmounts the app and mounts it again on the same storage, as a reload or a reopened tab. */
async function reopen(path: string, storage: KeyValueStorage) {
  const { root, container } = mounted as { root: Root; container: HTMLElement };
  act(() => root.unmount());
  container.remove();
  return mountApp(path, storage);
}

const guessNames = (container: HTMLElement) =>
  [...container.querySelectorAll('ol[aria-label="Gissningar"] li span[aria-hidden="true"]')].map(
    (span) => span.textContent,
  );
const takenHints = (container: HTMLElement) =>
  container.querySelectorAll(".hint-button.taken").length;

async function pick(container: HTMLElement, start: string, destination: string) {
  await type(startField(container), start);
  await type(destinationField(container), destination);
  await click(resButton(container));
}

async function guess(container: HTMLElement, name: string) {
  await type(query<HTMLInputElement>(container, "#guess-input"), name);
  await click(query(container, '.guess-input button[type="submit"]'));
}

describe("resuming the free-play trip", () => {
  const nynashamnTrosa = tripLinkPath(0, {
    start: "0192",
    destination: "0488",
    mode: { kind: "standard" },
  });
  const haningeTrosa = tripLinkPath(0, {
    start: "0136",
    destination: "0488",
    mode: { kind: "standard" },
  });

  test("a reload restores an unfinished trip's guesses and hints", async () => {
    const storage = memoryStorage();
    const { container } = await mountApp("/fri", storage);
    await pick(container, "Nynäshamn", "Trosa");
    await guess(container, "Haninge");
    await click(query(container, ".hint-button"));

    const reloaded = await reopen(address(), storage);
    expect(query(reloaded.container, "#trip-heading").textContent).toBe(
      "Res från Nynäshamn till Trosa",
    );
    expect(guessNames(reloaded.container)).toEqual(["✅ Haninge"]);
    expect(takenHints(reloaded.container)).toBe(1);
  });

  test("/fri resumes an unfinished trip straight onto its play screen, showing its link", async () => {
    const storage = memoryStorage();
    const { container } = await mountApp("/fri", storage);
    await pick(container, "Nynäshamn", "Trosa");
    await guess(container, "Haninge");

    const reopened = await reopen("/fri", storage);
    expect(guessNames(reopened.container)).toEqual(["✅ Haninge"]);
    expect(address()).toBe(nynashamnTrosa);
  });

  test("Back from an unfinished trip resumes it, as /fri does", async () => {
    const { container } = await mountApp("/fri");
    await pick(container, "Nynäshamn", "Trosa");
    await guess(container, "Haninge");

    await act(async () => {
      dom.window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(guessNames(container)).toEqual(["✅ Haninge"]);
    expect(address()).toBe(nynashamnTrosa);
  });

  test("the exact link to a finished trip reopens its result and share text, with no replay", async () => {
    const storage = memoryStorage();
    const { container } = await mountApp("/fri", storage);
    await pick(container, "Nynäshamn", "Trosa");
    await playToTheEnd(container, "Haninge", "Salem");

    const reopened = await reopen(`${nynashamnTrosa}&utm_source=chat`, storage);
    expect(query(reopened.container, "#result-heading").textContent).toBe("Perfekt!");
    expect(query(reopened.container, ".result-score").textContent).toBe("−1 poäng");
    await click(query(reopened.container, ".share-button"));
    expect(copied).toEqual([
      `#åkle Fri resa · Standard\n+0 (Perfekt) · −1 poäng\n✅✅\nhttps://akle.grehn.net${nynashamnTrosa}`,
    ]);
    expect(reopened.container.querySelector("#guess-input")).toBeNull();
  });

  test("/fri opens setup when the stored trip is finished", async () => {
    const storage = memoryStorage();
    const { container } = await mountApp("/fri", storage);
    await pick(container, "Nynäshamn", "Trosa");
    await playToTheEnd(container, "Haninge", "Salem");

    const reopened = await reopen("/fri", storage);
    expect(query(reopened.container, "#free-play-heading").textContent).toBe("Fri resa");
    expect(address()).toBe("/fri");
    // The stored trip's version is the current one, so it is loaded only once.
    expect(reopened.fetched).toEqual(["current"]);
  });

  test("Back from a finished trip returns to the setup screen", async () => {
    const { container } = await mountApp("/fri");
    await pick(container, "Nynäshamn", "Trosa");
    await playToTheEnd(container, "Haninge", "Salem");

    await act(async () => {
      dom.window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(address()).toBe("/fri");
    expect(query(container, "#free-play-heading").textContent).toBe("Fri resa");
  });

  test("a different link replaces the slot as it opens, dropping the unfinished trip", async () => {
    const storage = memoryStorage();
    const { container } = await mountApp("/fri", storage);
    await pick(container, "Nynäshamn", "Trosa");
    await guess(container, "Haninge");

    await reopen(haningeTrosa, storage);
    const back = await reopen(nynashamnTrosa, storage);
    expect(guessNames(back.container)).toEqual([]);

    const resumed = await reopen("/fri", storage);
    expect(query(resumed.container, "#trip-heading").textContent).toBe(
      "Res från Nynäshamn till Trosa",
    );
  });

  test("a new trip started from setup replaces the finished one", async () => {
    const storage = memoryStorage();
    const { container } = await mountApp("/fri", storage);
    await pick(container, "Nynäshamn", "Trosa");
    await playToTheEnd(container, "Haninge", "Salem");

    const setup = await reopen("/fri", storage);
    await pick(setup.container, "Haninge", "Trosa");

    const resumed = await reopen("/fri", storage);
    expect(query(resumed.container, "#trip-heading").textContent).toBe(
      "Res från Haninge till Trosa",
    );
    expect(address()).toBe(haningeTrosa);
  });

  test("a drawn trip keeps Slumpa ny resa when reopened finished", async () => {
    const storage = memoryStorage();
    const { container } = await mountApp("/fri", storage);
    await click(buttonNamed(container, "Slumpa resa") as HTMLElement);
    await playToTheEnd(container, "Haninge", "Salem");

    const reopened = await reopen(address(), storage);
    expect(buttonNamed(reopened.container, "Slumpa ny resa")).toBeDefined();
  });

  test.each([
    ["corrupt", "{not json"],
    [
      "pinned to a version that hasn't started",
      JSON.stringify({
        format: 1,
        versionOrdinal: 1,
        trip: { start: "0192", destination: "0488", mode: { kind: "standard" } },
        drawn: false,
        game: { guesses: [] },
      }),
    ],
    [
      "for kommuner its version lacks",
      JSON.stringify({
        format: 1,
        versionOrdinal: 0,
        trip: { start: "0192", destination: "9999", mode: { kind: "standard" } },
        drawn: false,
        game: { guesses: [] },
      }),
    ],
  ])("a %s slot is ignored, and /fri opens setup", async (_, slot) => {
    const storage = memoryStorage();
    storage.setItem("akle:free-play-trip", slot);
    const { container } = await mountApp("/fri", storage);
    expect(query(container, "#free-play-heading").textContent).toBe("Fri resa");
  });
});
