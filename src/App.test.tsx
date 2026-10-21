import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "./App";

describe("App", () => {
  test("shows the Åkle name with Swedish placeholder text", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain("<h1>Åkle</h1>");
    expect(markup).toContain("Kommer snart");
  });
});
