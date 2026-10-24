import { describe, expect, test } from "bun:test";
import { cacheViolations, headersFor } from "./staticHeaders";

describe("headersFor applies _headers rules the way Workers static assets do", () => {
  test("a path rule with a splat matches everything under it", () => {
    const rules = "/static/*\n  Access-Control-Allow-Origin: *\n";
    expect(headersFor(rules, "https://example.com/static/a/b.js")).toEqual({
      "access-control-allow-origin": "*",
    });
    expect(headersFor(rules, "https://example.com/other.js")).toEqual({});
  });

  test("an absolute rule with host placeholders matches only hosts of that shape", () => {
    const rules = "https://:version.:subdomain.workers.dev/*\n  X-Robots-Tag: noindex\n";
    expect(headersFor(rules, "https://pr-7-akle.someone.workers.dev/")).toEqual({
      "x-robots-tag": "noindex",
    });
    expect(headersFor(rules, "https://akle.grehn.net/")).toEqual({});
    expect(headersFor(rules, "https://a.b.c.workers.dev/")).toEqual({});
  });

  test("a header set by more than one matching rule joins the values with a comma", () => {
    const rules = "/*\n  X-Robots-Tag: nosnippet\n\n/static/*\n  X-Robots-Tag: noindex\n";
    expect(headersFor(rules, "https://example.com/static/a.css")).toEqual({
      "x-robots-tag": "nosnippet, noindex",
    });
  });
});

const akleRules = await Bun.file(new URL("../../public/_headers", import.meta.url)).text();

describe("Åkle's _headers", () => {
  test("hashed assets, including graph version data, are cached as immutable", () => {
    for (const asset of ["/assets/index-d-LJNzz7.js", "/assets/neighbors-B5Ks7dta.js"]) {
      expect(headersFor(akleRules, `https://akle.grehn.net${asset}`)["cache-control"]).toBe(
        "public, max-age=31536000, immutable",
      );
    }
  });

  test("index.html is revalidated on every load", () => {
    expect(headersFor(akleRules, "https://akle.grehn.net/")["cache-control"]).toBe("no-cache");
    expect(headersFor(akleRules, "https://akle.grehn.net/index.html")["cache-control"]).toBe(
      "no-cache",
    );
  });

  test("the free-play page is revalidated on every load", () => {
    expect(headersFor(akleRules, "https://akle.grehn.net/fri")["cache-control"]).toBe("no-cache");
    expect(headersFor(akleRules, "https://akle.grehn.net/fri.html")["cache-control"]).toBe(
      "no-cache",
    );
  });

  test("previews on workers.dev are noindex, production is not", () => {
    expect(headersFor(akleRules, "https://pr-21-akle.grehnen.workers.dev/")["x-robots-tag"]).toBe(
      "noindex",
    );
    expect(headersFor(akleRules, "https://akle.grehn.net/")["x-robots-tag"]).toBeUndefined();
  });
});

describe("cacheViolations", () => {
  const rules = "/assets/*\n  Cache-Control: immutable\n/\n  Cache-Control: no-cache\n";

  test("accepts hashed assets cached as immutable and index.html as no-cache", () => {
    expect(cacheViolations(rules, ["index.html", "assets/index-d-LJNzz7.js"])).toEqual([]);
  });

  test("checks every built page at the path Workers serve it from", () => {
    expect(cacheViolations(rules, ["index.html", "fri.html"])).toEqual([
      "fri.html is not served no-cache",
    ]);
    expect(cacheViolations(`${rules}/fri\n  Cache-Control: no-cache\n`, ["fri.html"])).toEqual([]);
  });

  test("reports a hashed asset or an index.html with the wrong caching", () => {
    expect(cacheViolations("", ["index.html", "assets/index-d-LJNzz7.js"])).toEqual([
      "index.html is not served no-cache",
      "assets/index-d-LJNzz7.js is not served immutable",
    ]);
  });
});
