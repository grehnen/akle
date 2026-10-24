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
});
