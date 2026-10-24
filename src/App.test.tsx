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

    expect(markup).toMatch(
      /<header[^>]*>.*aria-label="Fri resa".*<a href="\/resplan"[^>]*aria-label="Resplan"/,
    );
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
