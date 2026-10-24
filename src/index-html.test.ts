import { describe, expect, test } from "bun:test";

/** Every built page, with the title its tab shows. */
const pages = [
  ["index.html", "Åkle"],
  ["fri.html", "Åkle – Fri resa"],
] as const;

describe.each(pages)("%s", (file, title) => {
  const html = Bun.file(new URL(`../${file}`, import.meta.url)).text();

  test(`is a Swedish page titled ${title}`, async () => {
    expect(await html).toContain('<html lang="sv">');
    expect(await html).toContain(`<title>${title}</title>`);
  });

  test("starts the app", async () => {
    expect(await html).toContain('<div id="root"></div>');
    expect(await html).toContain('<script type="module" src="/src/main.tsx"></script>');
  });

  test("the viewport covers the safe areas and resizes for the on-screen keyboard", async () => {
    const viewport = (await html).match(/<meta\s+name="viewport"\s+content="([^"]*)"/)?.[1] ?? "";
    const settings = viewport.split(",").map((setting) => setting.trim());
    expect(settings).toContain("viewport-fit=cover");
    expect(settings).toContain("interactive-widget=resizes-content");
    expect(settings).not.toContain("user-scalable=no");
  });
});
