import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "./App";
import type { DailyTripSource } from "./daily/loadDailyTrip";

const neverLoads: DailyTripSource = {
  scheduleConfig: () => new Promise(() => {}),
  scheduleChunk: () => new Promise(() => {}),
  graphVersions: () => new Promise(() => {}),
  graphVersionFiles: () => new Promise(() => {}),
};

describe("App", () => {
  test("shows the Åkle name while today's trip loads", () => {
    const markup = renderToStaticMarkup(<App source={neverLoads} />);

    expect(markup).toContain("<h1>Åkle</h1>");
    expect(markup).toContain("Laddar");
  });

  test("has a stats button in the header, usable while the trip loads", () => {
    const markup = renderToStaticMarkup(<App source={neverLoads} />);

    expect(markup).toMatch(
      /<header[^>]*>.*<button[^>]*aria-label="Visa statistik"(?![^>]*disabled)/,
    );
  });

  test("has a how-to-play button before the title, usable while the trip loads", () => {
    const markup = renderToStaticMarkup(<App source={neverLoads} />);

    expect(markup).toMatch(
      /<header[^>]*><button[^>]*aria-label="Så spelar du"(?![^>]*disabled)[^>]*>.*<h1>/,
    );
  });

  test("has a free-play link in the header", () => {
    const markup = renderToStaticMarkup(<App source={neverLoads} path="/" />);

    expect(markup).toMatch(/<header[^>]*>.*<a href="\/fri"[^>]*aria-label="Fri resa"/);
  });

  test("has an itinerary link in the header, beside the free-play one", () => {
    const markup = renderToStaticMarkup(<App source={neverLoads} path="/" />);

    expect(markup).toMatch(/<header[^>]*>.*<a href="\/resplan"[^>]*aria-label="Resplan"/);
  });

  test("puts the header's controls in the order they appear, left to right, so Tab follows it", () => {
    const markup = renderToStaticMarkup(<App source={neverLoads} path="/fri" />);
    const header = markup.match(/<header[^>]*>.*<\/header>/)?.[0] ?? "";
    const controls = [...header.matchAll(/<(?:button|a)\b[^>]*>/g)].map(
      ([tag]) => tag.match(/aria-label="([^"]*)"/)?.[1] ?? (tag === '<a href="/">' ? "Åkle" : tag),
    );

    // On screen: rules at the left edge, the title centred, then 🗺, 🎲 and stats at the right.
    expect(controls).toEqual(["Så spelar du", "Åkle", "Resplan", "Fri resa", "Visa statistik"]);
  });

  test("gives every header button a tooltip that matches its accessible name", () => {
    const markup = renderToStaticMarkup(<App source={neverLoads} path="/" />);
    const header = markup.match(/<header[^>]*>.*<\/header>/)?.[0] ?? "";
    const buttons = [...header.matchAll(/<(?:button|a)\b[^>]*class="header-button[^>]*>/g)].map(
      ([tag]) => ({
        label: tag.match(/aria-label="([^"]*)"/)?.[1],
        title: tag.match(/title="([^"]*)"/)?.[1],
      }),
    );

    expect(buttons).toHaveLength(4);
    for (const { label, title } of buttons) expect(title).toBe(label);
  });

  test.each([
    ["/", []],
    ["/fri", ["Fri resa"]],
    ["/fri/", ["Fri resa"]],
    ["/fri?r=abc", ["Fri resa"]],
    ["/resplan", ["Resplan"]],
    ["/resplan.html", ["Resplan"]],
  ])("at %p marks %p as the current page in the header", (location, current) => {
    const [path, search] = location.split("?");
    const markup = renderToStaticMarkup(
      <App source={neverLoads} path={path} search={search ? `?${search}` : ""} />,
    );
    const marked = [...markup.matchAll(/<a\b[^>]*aria-current="page"[^>]*>/g)].map(
      ([tag]) => tag.match(/aria-label="([^"]*)"/)?.[1],
    );

    expect(marked).toEqual(current);
  });

  test.each(["/resplan", "/resplan/", "/resplan.html"])(
    "at %p shows the itinerary builder, with the title linking back to today's trip",
    (path) => {
      const markup = renderToStaticMarkup(<App source={neverLoads} path={path} />);

      expect(markup).toContain('<h1><a href="/">Åkle</a></h1>');
      expect(markup).toContain("Laddar resplan…");
      expect(markup).not.toContain("Laddar dagens resa");
    },
  );

  test.each(["/fri", "/fri/", "/fri.html"])(
    "at %p shows free play, with the title linking back to today's trip",
    (path) => {
      const markup = renderToStaticMarkup(<App source={neverLoads} path={path} />);

      expect(markup).toContain('<h1><a href="/">Åkle</a></h1>');
      expect(markup).toContain("Laddar fri resa…");
      expect(markup).not.toContain("Laddar dagens resa");
    },
  );
});
