import { expect, test } from "bun:test";

const indexHtml = await Bun.file(new URL("../index.html", import.meta.url)).text();

test("index.html is a Swedish page titled Åkle", () => {
  expect(indexHtml).toContain('<html lang="sv">');
  expect(indexHtml).toContain("<title>Åkle</title>");
});
