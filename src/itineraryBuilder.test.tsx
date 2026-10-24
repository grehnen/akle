import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import type { Root } from "react-dom/client";
import { App } from "./App";
import type { DailyTripSource } from "./daily/loadDailyTrip";
import { decodeLinkPayload } from "./freePlay/linkPayload";
import type { GraphVersionFiles } from "./graph/graphVersionFiles";
import { memoryStorage } from "./progress/storage";

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
// What Kopiera länk copies.
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

// Nynäshamn ── Haninge ── Salem ── Trosa: distance 1 has Nynäshamn–Salem and Haninge–Trosa,
// distance 2 only Nynäshamn–Trosa.
const currentFiles: GraphVersionFiles = {
  version: { id: "current", startsAtTrip: 1 },
  kommuner: "code,name\n0192,Nynäshamn\n0136,Haninge\n0128,Salem\n0488,Trosa\n",
  neighbors: "a,b,link\n0192,0136,land\n0136,0128,land\n0128,0488,land\n",
  shapes: { type: "FeatureCollection", features: [] },
};

/**
 * Launch is 2026-11-01 and the tests run before it, on trip #1's version "current", ordinal 1
 * behind "older"; "later" starts at trip #500. Only "current" can be loaded.
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
    { id: "older", startsAtTrip: 0 },
  ],
  graphVersionFiles: async (id) => {
    if (id !== "current") throw new Error(`no files for ${id}`);
    return currentFiles;
  },
};

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

async function mountApp(path: string) {
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
        now={() => new Date(2026, 9, 24, 12, 0)}
        storage={memoryStorage()}
        sessionStorage={memoryStorage()}
        path={pathname}
        search={search}
      />,
    ),
  );
  return container;
}

const query = <E extends Element = HTMLElement>(container: HTMLElement, selector: string) =>
  container.querySelector(selector) as E;

const button = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll("button")].find(
    (element) => element.textContent?.trim() === text,
  ) as HTMLButtonElement;

async function click(element: Element) {
  await act(async () => (element as HTMLElement).click());
}

describe("getting to the itinerary builder", () => {
  test("the header's 🗺 opens an empty builder on /resplan", async () => {
    const container = await mountApp("/");
    await click(query(container, 'header a[aria-label="Resplan"]'));

    expect(dom.window.location.pathname).toBe("/resplan");
    expect(dom.window.document.title).toBe("Åkle – Resplan");
    expect(query(container, "#itinerary-heading").textContent).toBe("Bygg en resplan");
    expect(query(container, ".itinerary-empty").textContent).toBe(
      "Inga resor än. Lägg till minst två nedan.",
    );
    expect(query(container, ".itinerary-count").textContent).toBe("0 av 20 resor · minst 2");
    expect(button(container, "Kopiera länk").disabled).toBe(true);
    expect(button(container, "Spela").disabled).toBe(true);
  });
});

async function type(input: HTMLInputElement, text: string) {
  const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value");
  await act(async () => {
    setValue?.set?.call(input, text);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

/** Each row of the trip list as its pair's visible text. */
const rows = (container: HTMLElement) =>
  [...container.querySelectorAll(".itinerary-trip-pair")].map((pair) => pair.textContent);

/** Hand-picks a trip by its ends' names on the Välj själv tab. */
async function pick(container: HTMLElement, start: string, destination: string) {
  await click(query(container, "#itinerary-tab-pick"));
  await type(query(container, "#itinerary-start"), start);
  await type(query(container, "#itinerary-destination"), destination);
  await click(button(container, "Lägg till"));
}

describe("adding trips", () => {
  test("a hand-picked trip shows its pair, and the fields clear for the next", async () => {
    const container = await mountApp("/resplan");
    await click(query(container, "#itinerary-tab-pick"));
    await type(query(container, "#itinerary-start"), "Nynäshamn");
    await type(query(container, "#itinerary-destination"), "Salem");
    expect(query(container, "#itinerary-panel-pick .free-play-distance").textContent).toBe(
      "Avstånd 1",
    );
    await click(button(container, "Lägg till"));

    expect(rows(container)).toEqual(["Nynäshamn → Salem"]);
    expect(container.querySelector(".itinerary-empty")).toBeNull();
    expect(query<HTMLInputElement>(container, "#itinerary-start").value).toBe("");
    expect(query<HTMLInputElement>(container, "#itinerary-destination").value).toBe("");
    expect(query(container, ".itinerary-count").textContent).toBe("1 av 20 resor · minst 2");
  });

  test("Välj själv can't add a trip to the same kommun or a neighbor", async () => {
    const container = await mountApp("/resplan");
    await click(query(container, "#itinerary-tab-pick"));
    await type(query(container, "#itinerary-start"), "Nynäshamn");
    await type(query(container, "#itinerary-destination"), "Haninge");
    expect(button(container, "Lägg till").disabled).toBe(true);
    await type(query(container, "#itinerary-destination"), "Nynäshamn");
    expect(button(container, "Lägg till").disabled).toBe(true);
  });
});

const drawButton = (container: HTMLElement) =>
  query<HTMLButtonElement>(container, "#itinerary-panel-draw .itinerary-draw");
const labelled = (container: HTMLElement, label: string) =>
  query<HTMLButtonElement>(container, `[aria-label="${label}"]`);
/** The mode dropdown of the trip list's row `number`. */
const rowMode = (container: HTMLElement, number: number) =>
  query<HTMLSelectElement>(container, `.itinerary-trip:nth-child(${number}) select`);

async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
}

describe("drawing trips", () => {
  test("Slumpa adds five drawn trips at once, each hidden until Visa", async () => {
    const container = await mountApp("/resplan");
    // The four-kommun path's largest distance is 2, so the range is 2–2: Nynäshamn–Trosa.
    expect(query(container, ".free-play-range-label").textContent).toBe("Avstånd 2");
    expect(drawButton(container).textContent).toBe("🎲 Lägg till 5 slumpade");
    await click(drawButton(container));

    expect(rows(container)).toEqual(Array(5).fill("🎲 Slumpad · avstånd 2"));
    await click(labelled(container, "Visa resa 2"));
    expect(rows(container)[1]).toMatch(/^(Nynäshamn → Trosa|Trosa → Nynäshamn)$/);
    expect(rows(container).filter((row) => row?.startsWith("🎲"))).toHaveLength(4);
  });

  test("the count can be changed, and is capped at the room left", async () => {
    const container = await mountApp("/resplan");
    await click(labelled(container, "Fler resor"));
    expect(drawButton(container).textContent).toBe("🎲 Lägg till 6 slumpade");
    await click(drawButton(container));
    await click(drawButton(container));
    await click(drawButton(container));
    expect(query(container, ".itinerary-count").textContent).toBe("18 av 20 resor");
    expect(drawButton(container).textContent).toBe("🎲 Lägg till 2 slumpade");
    expect(labelled(container, "Fler resor").disabled).toBe(true);
  });
});

describe("a full itinerary", () => {
  test("at 20 trips the panel and duplicating are disabled, until a trip is removed", async () => {
    const container = await mountApp("/resplan");
    for (let draw = 0; draw < 4; draw++) await click(drawButton(container));

    expect(query(container, ".itinerary-count").textContent).toBe("20 av 20 resor");
    const panel = query<HTMLFieldSetElement>(container, "fieldset.itinerary-add");
    expect(panel.disabled).toBe(true);
    expect(query(container, "fieldset.itinerary-add legend").textContent).toBe(
      "Lägg till resor (fullt)",
    );
    expect(labelled(container, "Dubblera resa 1").disabled).toBe(true);

    await click(labelled(container, "Ta bort resa 20"));
    expect(panel.disabled).toBe(false);
    expect(drawButton(container).textContent).toBe("🎲 Lägg till 1 slumpade");
  });
});

describe("editing the trip list", () => {
  test("trips can be moved, duplicated with their settings and removed", async () => {
    const container = await mountApp("/resplan");
    await pick(container, "Nynäshamn", "Salem");
    await pick(container, "Haninge", "Trosa");
    await choose(rowMode(container, 1), "unlimited");

    await click(labelled(container, "Flytta ner resa 1"));
    expect(rows(container)).toEqual(["Haninge → Trosa", "Nynäshamn → Salem"]);
    expect(labelled(container, "Flytta ner resa 2").disabled).toBe(true);
    expect(labelled(container, "Flytta upp resa 1").disabled).toBe(true);

    await click(labelled(container, "Dubblera resa 2"));
    expect(rows(container)).toEqual(["Haninge → Trosa", "Nynäshamn → Salem", "Nynäshamn → Salem"]);
    const modes = [...container.querySelectorAll<HTMLSelectElement>(".itinerary-trip select")];
    expect(modes.map((select) => select.value)).toEqual(["standard", "unlimited", "unlimited"]);

    await click(labelled(container, "Ta bort resa 1"));
    expect(rows(container)).toEqual(["Nynäshamn → Salem", "Nynäshamn → Salem"]);
  });

  test("a duplicated drawn trip copies its pair, still hidden", async () => {
    const container = await mountApp("/resplan");
    for (let step = 0; step < 4; step++) await click(labelled(container, "Färre resor"));
    await click(drawButton(container));
    await click(labelled(container, "Dubblera resa 1"));
    expect(rows(container)).toEqual(["🎲 Slumpad · avstånd 2", "🎲 Slumpad · avstånd 2"]);
    await click(labelled(container, "Visa resa 1"));
    await click(labelled(container, "Visa resa 2"));
    expect(rows(container)[0]).toBe(rows(container)[1]);
  });
});

describe("the itinerary's link", () => {
  test("Kopiera länk copies a link with the title, trips, modes, thinking times and version", async () => {
    const container = await mountApp("/resplan");
    await type(query(container, "#itinerary-title"), "Helgresan");
    await pick(container, "Nynäshamn", "Salem");
    await choose(query(container, "#itinerary-new-mode"), "timed");
    const newThinkingTime = query<HTMLInputElement>(container, "#itinerary-new-thinking-time");
    expect(newThinkingTime.value).toBe("10");
    await type(newThinkingTime, "17");
    await pick(container, "Trosa", "Haninge");
    await click(labelled(container, "Dubblera resa 1"));
    await choose(rowMode(container, 2), "tie-breaker");
    expect(query(container, ".itinerary-count").textContent).toBe("3 av 20 resor");

    await click(button(container, "Kopiera länk"));
    expect(copied).toHaveLength(1);
    const url = new URL(copied[0]);
    expect(url.origin).toBe("https://akle.grehn.net");
    expect(url.pathname).toBe("/resplan");
    expect(url.searchParams.get("namn")).toBe("Helgresan");
    expect(decodeLinkPayload(url.searchParams.get("r") ?? "")).toEqual({
      ok: true,
      payload: {
        // "current" is the version today's trip uses, second by start trip after "older".
        versionOrdinal: 1,
        trips: [
          { start: "0192", destination: "0128", mode: { kind: "standard" } },
          { start: "0192", destination: "0128", mode: { kind: "tie-breaker" } },
          { start: "0488", destination: "0136", mode: { kind: "timed", thinkingTime: 17 } },
        ],
      },
    });
    expect(query(container, ".itinerary-toast").textContent).toBe("Kopierat!");
  });

  test("a trip's betänketid takes any whole second from 5 to 60, as the setup's does", async () => {
    const container = await mountApp("/resplan");
    await pick(container, "Nynäshamn", "Salem");
    await pick(container, "Trosa", "Haninge");
    await choose(rowMode(container, 2), "timed");
    const thinkingTime = query<HTMLInputElement>(
      container,
      ".itinerary-trip:nth-child(2) input[type='range']",
    );
    expect([thinkingTime.min, thinkingTime.max, thinkingTime.step]).toEqual(["5", "60", "1"]);
    await type(thinkingTime, "23");
    expect(query(container, ".itinerary-trip:nth-child(2) output").textContent).toBe("23 s");

    await click(button(container, "Kopiera länk"));
    const url = new URL(copied[0]);
    const decoded = decodeLinkPayload(url.searchParams.get("r") ?? "");
    expect(decoded.ok && decoded.payload.trips[1]?.mode).toEqual({
      kind: "timed",
      thinkingTime: 23,
    });
  });

  test("Kopiera länk and Spela wait for the second trip", async () => {
    const container = await mountApp("/resplan");
    await pick(container, "Nynäshamn", "Salem");
    expect(button(container, "Kopiera länk").disabled).toBe(true);
    expect(button(container, "Spela").disabled).toBe(true);
    await pick(container, "Nynäshamn", "Salem");
    expect(query(container, ".itinerary-count").textContent).toBe("2 av 20 resor");
    expect(button(container, "Kopiera länk").disabled).toBe(false);
    expect(button(container, "Spela").disabled).toBe(false);
  });

  test("Spela opens the built link in place", async () => {
    const container = await mountApp("/resplan");
    await pick(container, "Nynäshamn", "Salem");
    await pick(container, "Haninge", "Trosa");
    await click(button(container, "Spela"));

    expect(dom.window.location.pathname).toBe("/resplan");
    const r = new URLSearchParams(dom.window.location.search).get("r") ?? "";
    expect(decodeLinkPayload(r).ok).toBe(true);
    expect(container.querySelector("#itinerary-heading")).toBeNull();
  });

  test("the title takes at most 40 characters, with a counter", async () => {
    const container = await mountApp("/resplan");
    const title = query<HTMLInputElement>(container, "#itinerary-title");
    expect(title.maxLength).toBe(40);
    await type(title, "x".repeat(45));
    expect(title.value).toBe("x".repeat(40));
    expect(query(container, ".itinerary-title-count").textContent).toBe("40/40 tecken");
  });
});
