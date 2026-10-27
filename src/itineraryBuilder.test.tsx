import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import type { Root } from "react-dom/client";
import { App } from "./App";
import type { DailyTripSource } from "./daily/loadDailyTrip";
import { decodeLinkPayload } from "./freePlay/linkPayload";
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
        now={() => new Date(2026, 9, 24, 12, 0)}
        storage={storage}
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

  test("Antal drops to the room left after adding, and stays there when trips are removed", async () => {
    const container = await mountApp("/resplan");
    for (let step = 0; step < 3; step++) await click(labelled(container, "Fler resor"));
    await click(drawButton(container));
    await click(drawButton(container));
    expect(query(container, ".itinerary-count").textContent).toBe("16 av 20 resor");
    expect(query(container, ".itinerary-stepper output").textContent).toBe("4");

    await click(labelled(container, "Ta bort resa 1"));
    await click(labelled(container, "Ta bort resa 1"));
    expect(query(container, ".itinerary-stepper output").textContent).toBe("4");
    expect(drawButton(container).textContent).toBe("🎲 Lägg till 4 slumpade");
  });
});

/** What the builder last announced, as a screen reader hears it. */
const announced = (container: HTMLElement) =>
  query(container, ".itinerary-announcer").textContent?.trim();
const focused = () => dom.window.document.activeElement;

describe("announcing added trips", () => {
  test("Lägg till announces the trip and focuses Start for the next pair", async () => {
    const container = await mountApp("/resplan");
    await pick(container, "Nynäshamn", "Salem");
    expect(announced(container)).toBe("Resa 1 tillagd");
    await pick(container, "Haninge", "Trosa");
    expect(announced(container)).toBe("Resa 2 tillagd");
    expect(focused()).toBe(query(container, "#itinerary-start"));
  });

  test("a draw of five announces them all, focus staying on the draw button", async () => {
    const container = await mountApp("/resplan");
    await click(drawButton(container));
    expect(announced(container)).toBe("5 resor tillagda");
    expect(focused()).toBe(drawButton(container));
  });

  test("the add that fills the itinerary moves focus to the bar's count", async () => {
    const container = await mountApp("/resplan");
    for (let draw = 0; draw < 4; draw++) await click(drawButton(container));
    expect(announced(container)).toBe("5 resor tillagda");
    expect(focused()).toBe(query(container, ".itinerary-count"));
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
    expect(drawButton(container).textContent).toBe("🎲 Lägg till 1 slumpad");

    await click(labelled(container, "Ta bort resa 20"));
    expect(panel.disabled).toBe(false);
    expect(drawButton(container).textContent).toBe("🎲 Lägg till 1 slumpad");
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
    const modes = [
      ...container.querySelectorAll<HTMLSelectElement>(".itinerary-trip select[id$='-mode']"),
    ];
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

const undoToast = (container: HTMLElement) => container.querySelector(".itinerary-undo");
/** Row `number`'s betänketid. */
const rowThinkingTime = (container: HTMLElement, number: number) =>
  query<HTMLSelectElement>(
    container,
    `.itinerary-trip:nth-child(${number}) .itinerary-thinking-time`,
  );

describe("removing a trip", () => {
  test("shows Ångra, which puts the trip back in place with its mode and revealed pair", async () => {
    const container = await mountApp("/resplan");
    await click(drawButton(container));
    await choose(rowMode(container, 3), "timed");
    await choose(rowThinkingTime(container, 3), "23");
    await click(labelled(container, "Visa resa 3"));
    const pair = rows(container)[2];

    await click(labelled(container, "Ta bort resa 3"));
    expect(rows(container)).toHaveLength(4);
    expect(undoToast(container)?.textContent).toBe("Resa 3 borttagenÅngra");
    expect(announced(container)).toBe("Resa 3 borttagen");
    expect(focused()).toBe(labelled(container, "Ta bort resa 3"));

    await click(button(container, "Ångra"));
    expect(rows(container)).toHaveLength(5);
    expect(rows(container)[2]).toBe(pair);
    expect(rowMode(container, 3).value).toBe("timed");
    expect(rowThinkingTime(container, 3).value).toBe("23");
    expect(undoToast(container)).toBeNull();
    expect(focused()).toBe(labelled(container, "Ta bort resa 3"));
  });

  test("a hidden drawn trip comes back still hidden", async () => {
    const container = await mountApp("/resplan");
    await click(drawButton(container));
    await click(labelled(container, "Ta bort resa 4"));
    await click(button(container, "Ångra"));
    expect(rows(container)[3]).toBe("🎲 Slumpad · avstånd 2");
  });

  test("only the latest removal can be undone", async () => {
    const container = await mountApp("/resplan");
    await pick(container, "Nynäshamn", "Salem");
    await pick(container, "Haninge", "Trosa");
    await pick(container, "Trosa", "Haninge");
    await click(labelled(container, "Ta bort resa 1"));
    await click(labelled(container, "Ta bort resa 1"));
    expect(undoToast(container)?.textContent).toBe("Resa 1 borttagenÅngra");
    await click(button(container, "Ångra"));
    expect(rows(container)).toEqual(["Haninge → Trosa", "Trosa → Haninge"]);
    expect(undoToast(container)).toBeNull();
  });

  test("the last row's removal focuses the row before, and the only row's the empty list", async () => {
    const container = await mountApp("/resplan");
    await pick(container, "Nynäshamn", "Salem");
    await pick(container, "Haninge", "Trosa");
    await click(labelled(container, "Ta bort resa 2"));
    expect(focused()).toBe(labelled(container, "Ta bort resa 1"));
    await click(labelled(container, "Ta bort resa 1"));
    expect(focused()).toBe(query(container, ".itinerary-empty"));
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

  test("the mode for new trips says how it plays, and its betänketid slider is labelled in sight", async () => {
    const container = await mountApp("/resplan");
    const description = () => query(container, ".itinerary-add .itinerary-mode-description");
    const select = query<HTMLSelectElement>(container, "#itinerary-new-mode");
    expect(description().textContent).toBe(
      "Som dagens resa: gissningarna räcker till avståndet och lite till.",
    );
    expect(select.getAttribute("aria-describedby")).toBe(description().id);

    await choose(select, "timed");
    expect(description().textContent).toBe(
      "Varje gissning måste göras inom betänketiden. Varje gång tiden går ut kostar en poäng.",
    );
    const label = query<HTMLInputElement>(container, "#itinerary-new-thinking-time").labels?.[0];
    expect(label?.textContent).toBe("Betänketid");
    expect(label?.classList.contains("visually-hidden")).toBe(false);

    // Not repeated on each trip.
    await pick(container, "Nynäshamn", "Salem");
    expect(container.querySelector(".itinerary-trip .itinerary-mode-description")).toBeNull();
  });

  test("a trip's betänketid takes any whole second from 5 to 60 from a compact dropdown", async () => {
    const container = await mountApp("/resplan");
    await pick(container, "Nynäshamn", "Salem");
    await pick(container, "Trosa", "Haninge");
    await choose(rowMode(container, 2), "timed");
    const thinkingTime = rowThinkingTime(container, 2);
    expect(thinkingTime.labels[0]?.textContent).toBe("Betänketid, resa 2");
    expect([...thinkingTime.options].map((option) => option.textContent)).toEqual(
      Array.from({ length: 56 }, (_, index) => `${index + 5} s`),
    );
    await choose(thinkingTime, "23");

    await click(button(container, "Kopiera länk"));
    const url = new URL(copied[0]);
    const decoded = decodeLinkPayload(url.searchParams.get("r") ?? "");
    expect(decoded.ok && decoded.payload.trips[1]?.mode).toEqual({
      kind: "timed",
      thinkingTime: 23,
    });
  });

  test("a failed copy shows the link selected in a read-only field, until the next edit", async () => {
    const container = await mountApp("/resplan");
    await pick(container, "Nynäshamn", "Salem");
    await pick(container, "Haninge", "Trosa");
    const clipboard = globalThis.navigator.clipboard;
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
    try {
      await click(button(container, "Kopiera länk"));
    } finally {
      Object.defineProperty(globalThis.navigator, "clipboard", {
        configurable: true,
        value: clipboard,
      });
    }

    const field = query<HTMLInputElement>(container, ".itinerary-copy-fallback input");
    expect(field.readOnly).toBe(true);
    expect(new URL(field.value).origin).toBe("https://akle.grehn.net");
    expect(focused()).toBe(field);
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, field.value.length]);
    expect(query(container, ".itinerary-copy-fallback label").textContent).toBe(
      "Kunde inte kopiera. Kopiera länken själv:",
    );

    await click(button(container, "Kopiera länk"));
    expect(container.querySelector(".itinerary-copy-fallback")).toBeNull();
    expect(query(container, ".itinerary-toast").textContent).toBe("Kopierat!");
  });

  test("the link to copy by hand goes away after an edit", async () => {
    const container = await mountApp("/resplan");
    await pick(container, "Nynäshamn", "Salem");
    await pick(container, "Haninge", "Trosa");
    const clipboard = globalThis.navigator.clipboard;
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    try {
      await click(button(container, "Kopiera länk"));
    } finally {
      Object.defineProperty(globalThis.navigator, "clipboard", {
        configurable: true,
        value: clipboard,
      });
    }
    expect(container.querySelector(".itinerary-copy-fallback")).not.toBeNull();
    await type(query(container, "#itinerary-title"), "Helgresan");
    expect(container.querySelector(".itinerary-copy-fallback")).toBeNull();
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
    await type(title, "x".repeat(45));
    expect(title.value).toBe("x".repeat(40));
    expect(query(container, ".itinerary-title-count").textContent).toBe("40/40 tecken");
  });

  test("the title counts characters, not UTF-16 units: an emoji is one", async () => {
    const container = await mountApp("/resplan");
    const title = query<HTMLInputElement>(container, "#itinerary-title");
    await type(title, "Tåg🚂");
    expect(query(container, ".itinerary-title-count").textContent).toBe("4/40 tecken");
    await type(title, "🚂".repeat(45));
    expect(title.value).toBe("🚂".repeat(40));
    expect(query(container, ".itinerary-title-count").textContent).toBe("40/40 tecken");
  });

  test("typing into a full title loses nothing and leaves the caret where it was", async () => {
    const container = await mountApp("/resplan");
    const title = query<HTMLInputElement>(container, "#itinerary-title");
    const full = "a".repeat(20) + "b".repeat(20);
    await type(title, full);

    const setValue = Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      "value",
    );
    await act(async () => {
      setValue?.set?.call(title, "a".repeat(20) + "x" + "b".repeat(20));
      title.setSelectionRange(21, 21);
      title.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    expect(title.value).toBe(full);
    expect(title.selectionStart).toBe(20);
  });
});

/** Unmounts the app, as a reload would leave it, keeping what it stored. */
function unmount() {
  if (!mounted) return;
  const { root, container } = mounted;
  act(() => root.unmount());
  container.remove();
  mounted = undefined;
}

const modes = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLSelectElement>(".itinerary-trip select[id$='-mode']")].map(
    (select) => select.value,
  );

/** A title, three trips in a changed order, one drawn, with modes and a betänketid. */
async function buildDraft(container: HTMLElement) {
  await type(query(container, "#itinerary-title"), "Helgresan");
  await pick(container, "Nynäshamn", "Salem");
  await pick(container, "Haninge", "Trosa");
  for (let step = 0; step < 4; step++) await click(labelled(container, "Färre resor"));
  await click(query(container, "#itinerary-tab-draw"));
  await click(drawButton(container));
  await click(labelled(container, "Flytta ner resa 1"));
  await choose(rowMode(container, 1), "timed");
  await choose(rowThinkingTime(container, 1), "23");
  await choose(rowMode(container, 3), "tie-breaker");
}

async function expectDraft(container: HTMLElement) {
  expect(query<HTMLInputElement>(container, "#itinerary-title").value).toBe("Helgresan");
  expect(rows(container)).toEqual([
    "Haninge → Trosa",
    "Nynäshamn → Salem",
    "🎲 Slumpad · avstånd 2",
  ]);
  expect(modes(container)).toEqual(["timed", "standard", "tie-breaker"]);
  expect(rowThinkingTime(container, 1).value).toBe("23");
}

describe("the builder's draft", () => {
  test("the title, trips, their order, modes and betänketider survive a reload", async () => {
    const storage = memoryStorage();
    await buildDraft(await mountApp("/resplan", storage));
    unmount();

    await expectDraft(await mountApp("/resplan", storage));
  });

  test("the draft is still there after Spela and Back", async () => {
    const container = await mountApp("/resplan");
    await buildDraft(container);
    await click(button(container, "Spela"));
    expect(container.querySelector("#itinerary-heading")).toBeNull();

    await act(async () => {
      dom.window.history.replaceState(null, "", "/resplan");
      dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate"));
    });
    await expectDraft(container);
  });

  test("Ny resplan empties the builder, and it stays empty after a reload", async () => {
    const storage = memoryStorage();
    const container = await mountApp("/resplan", storage);
    expect(button(container, "Ny resplan").disabled).toBe(true);
    await buildDraft(container);
    await click(button(container, "Ny resplan"));

    expect(query<HTMLInputElement>(container, "#itinerary-title").value).toBe("");
    expect(rows(container)).toEqual([]);
    expect(button(container, "Ny resplan").disabled).toBe(true);
    unmount();

    const reloaded = await mountApp("/resplan", storage);
    expect(query(reloaded, ".itinerary-count").textContent).toBe("0 av 20 resor · minst 2");
  });

  test("a corrupt stored draft is ignored, and the builder opens empty", async () => {
    const storage = memoryStorage();
    storage.setItem("akle:itinerary-draft", '{"format":1,"versionOrdinal":1,"title":7}');
    const container = await mountApp("/resplan", storage);
    expect(query(container, "#itinerary-heading").textContent).toBe("Bygg en resplan");
    expect(query(container, ".itinerary-count").textContent).toBe("0 av 20 resor · minst 2");
  });
});
