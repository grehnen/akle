import { expect, test } from "bun:test";

const indexHtml = await Bun.file(new URL("../index.html", import.meta.url)).text();

test("index.html is a Swedish page titled Åkle", () => {
  expect(indexHtml).toContain('<html lang="sv">');
  expect(indexHtml).toContain("<title>Åkle</title>");
});

test("the viewport covers the safe areas and resizes for the on-screen keyboard", () => {
  const viewport = indexHtml.match(/<meta\s+name="viewport"\s+content="([^"]*)"/)?.[1] ?? "";
  const settings = viewport.split(",").map((setting) => setting.trim());
  expect(settings).toContain("viewport-fit=cover");
  expect(settings).toContain("interactive-widget=resizes-content");
  expect(settings).not.toContain("user-scalable=no");
});
