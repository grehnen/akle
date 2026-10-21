import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "./App";
import type { DailyPuzzleSource } from "./daily/loadDailyPuzzle";

const neverLoads: DailyPuzzleSource = {
  scheduleConfig: () => new Promise(() => {}),
  scheduleChunk: () => new Promise(() => {}),
  graphVersions: () => new Promise(() => {}),
  graphVersionFiles: () => new Promise(() => {}),
};

describe("App", () => {
  test("shows the Åkle name while today's puzzle loads", () => {
    const markup = renderToStaticMarkup(<App source={neverLoads} />);

    expect(markup).toContain("<h1>Åkle</h1>");
    expect(markup).toContain("Laddar");
  });

  test("has a stats button in the header, usable while the puzzle loads", () => {
    const markup = renderToStaticMarkup(<App source={neverLoads} />);

    expect(markup).toMatch(
      /<header[^>]*>.*<button[^>]*aria-label="Visa statistik"(?![^>]*disabled)/,
    );
  });
});
