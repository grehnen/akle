// A model of how Workers static assets apply a `_headers` file, so the repo can check which
// headers each built file and host will get:
// https://developers.cloudflare.com/workers/static-assets/headers/

import { SITE_URL } from "../../src/siteUrl";

type HeaderRule = { pattern: string; headers: [name: string, value: string][] };

export function parseHeaderRules(rulesText: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  for (const line of rulesText.split("\n")) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      rules.push({ pattern: line.trim(), headers: [] });
      continue;
    }
    const separator = line.indexOf(":");
    rules
      .at(-1)
      ?.headers.push([
        line.slice(0, separator).trim().toLowerCase(),
        line.slice(separator + 1).trim(),
      ]);
  }
  return rules;
}

function patternRegex(pattern: string, placeholderMatch: string): RegExp {
  const source = pattern
    .split(/(\*|:[A-Za-z]\w*)/)
    .map((token) => {
      if (token === "*") return ".*";
      if (token.startsWith(":")) return placeholderMatch;
      return token.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return new RegExp(`^${source}$`);
}

function patternMatches(pattern: string, url: URL): boolean {
  if (!pattern.startsWith("https://")) return patternRegex(pattern, "[^/]+").test(url.pathname);
  const pathStart = pattern.indexOf("/", "https://".length);
  const hostPattern = pattern.slice("https://".length, pathStart);
  return (
    patternRegex(hostPattern, "[^.]+").test(url.hostname) &&
    patternRegex(pattern.slice(pathStart), "[^/]+").test(url.pathname)
  );
}

/** The custom headers a request for `url` gets, keyed by lower-case header name. */
export function headersFor(rulesText: string, url: string): Record<string, string> {
  const requestUrl = new URL(url);
  const headers: Record<string, string> = {};
  for (const rule of parseHeaderRules(rulesText)) {
    if (!patternMatches(rule.pattern, requestUrl)) continue;
    for (const [name, value] of rule.headers) {
      headers[name] = name in headers ? `${headers[name]}, ${value}` : value;
    }
  }
  return headers;
}

/**
 * Checks the built asset paths (relative to the assets directory) against the caching policy:
 * every hashed file under assets/ is immutable, and index.html is no-cache.
 */
export function cacheViolations(rulesText: string, builtFiles: string[]): string[] {
  const cacheControl = (path: string) =>
    headersFor(rulesText, `${SITE_URL}${path}`)["cache-control"] ?? "";
  const violations: string[] = [];
  for (const file of builtFiles) {
    if (file === "index.html") {
      // Workers serve index.html at "/" (a request for /index.html redirects there).
      if (cacheControl("/") !== "no-cache") {
        violations.push(`${file} is not served no-cache`);
      }
    } else if (file.startsWith("assets/") && !cacheControl(`/${file}`).includes("immutable")) {
      violations.push(`${file} is not served immutable`);
    }
  }
  return violations;
}
