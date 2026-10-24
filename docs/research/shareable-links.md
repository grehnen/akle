# Shareable playlist links without a backend

Research for issue #52. Findings only; no decisions. Dated 2026-10-24.

Confidence tags: **[primary]** = stated by the owner of the thing; **[derived]** = my arithmetic or inference from primary facts; **[no primary source]** = the vendor documents nothing, so treat any number as folklore.

## Summary

- A playlist of 5-20 puzzles fits in roughly 40-140 URL characters with plain codes or simple bit-packing. Every limit below is orders of magnitude higher, except SMS and the practical "link stays one clickable token" concerns. Compression is not needed at this size.
- Browsers and Cloudflare accept URLs of at least 16 KB; messaging apps document message-text limits (Discord 2000, Slack ~4000, SMS 160/segment), not URL limits. WhatsApp, iMessage and Messenger publish nothing usable for consumer chat.
- Cloudflare `single-page-application` fallback serves `/index.html` with 200 for any unmatched path, with the query string and hash left to the client. Path routing works with no Worker code; the hash never reaches the server either way.
- Codes (4-digit kommun codes) survive a graph version change better than indices; but a link is still tied to the graph version that applies to the *current* puzzle numbers, see "Graph version implications".

## 1. URL length limits

| Where | Limit | Source |
|---|---|---|
| HTTP spec | Senders and recipients SHOULD support URIs of at least 8000 octets (RFC 9110 s4.1) | [primary] https://www.rfc-editor.org/rfc/rfc9110.html#section-4.1 |
| Chrome / Chromium | URLs limited to 2 MB; omnibox displays at most 32 kB | [primary] https://chromium.googlesource.com/chromium/src/+/main/docs/security/url_display_guidelines/url_display_guidelines.md |
| Cloudflare (Workers/edge request) | URL size 16 KB; request headers 128 KB total | [primary] https://developers.cloudflare.com/workers/platform/limits/ |
| Firefox, Safari | No documented limit found in MDN/vendor docs | [no primary source] |

The Cloudflare 16 KB limit is a ceiling on the *request URL*; a URL fragment (`#...`) is never sent to the server, so it does not count toward it [derived from RFC 3986 / HTTP semantics].

### Messaging apps

| App | What is documented | Notes |
|---|---|---|
| Discord | Message length 2000 chars (4000 with Nitro) | [primary] https://support.discord.com/hc/en-us/articles/33694251638295 . No URL-specific limit. |
| Slack | "limit the number of characters in the `text` field to 4,000"; messages over 40,000 chars are truncated; no URL length limit stated | [primary] https://docs.slack.dev/reference/methods/chat.postMessage/ (API doc; applies to API-posted messages, user-typed behaviour not documented) |
| WhatsApp | Consumer message limit not found in primary docs. Business API: text messages are documented by BSPs as 4096 chars; Meta's own page covers template bodies (1024) | [no primary source] for consumer chat. Meta page: https://developers.facebook.com/documentation/business-messaging/whatsapp/direct-send/supported-features-and-limits/ |
| Messenger | Send API text limit not confirmed by search; nothing on URLs | [no primary source] |
| iMessage | Apple publishes no length limits | [no primary source] |
| SMS | One SMS carries 140 octets: 160 GSM-7 chars, or 70 UCS-2 chars; concatenated segments carry 153 / 67 because of a 6-octet header (3GPP TS 23.040 / 23.038) | [derived from vendor docs citing 3GPP]; I did not read the 3GPP text itself. E.g. https://developer.vonage.com/fr/messages/guides/sms/concatenation-and-encoding |

Practical reading [derived]:

- SMS is the only channel where length visibly matters: a 160-char single segment must also hold the domain and any message text. Keep the link well under ~100 chars if SMS single-segment is a goal. A URL with non-GSM-7 characters (none in base64url / digits) would switch the whole message to UCS-2, so stay ASCII.
- Messengers may linkify only up to the first space or punctuation. Characters that commonly break auto-linking: trailing `.`, `)`, `,`, and (in some apps) `~`, `|`. This is app behaviour, not documented; verify empirically. Base64url's `-` and `_` and digits are the safest set; `=` padding is also unsafe (RFC 4648 notes it is typically percent-encoded in URIs), so omit padding.
- Link previews: apps fetch the URL's HTML for Open Graph tags. With an SPA fallback every path returns the same `index.html`, so every playlist link shows the same preview. (Per-link previews would need a Worker; out of scope here.)

## 2. Encodings for 5-20 puzzles

Data per puzzle: start, destination, mode, a few settings. Kommuner: 290 rows in `data/graphs/osm-2026-10-01/kommuner.csv` (4-digit codes such as `0114`; first two digits are the län).

Size arithmetic [derived]:

| Scheme | Per puzzle | 20 puzzles | Text form |
|---|---|---|---|
| Decimal codes as text, e.g. `0114-0115.m1` | ~12-14 chars | ~260 chars | readable, debuggable |
| Codes bit-packed (14 bits each, 0-9999) + 1 byte mode/settings | 36 bits | 90 bytes -> 120 base64url chars | |
| Indices bit-packed (9 bits each, <512) + 1 byte mode/settings | 26 bits | 65 bytes -> ~87 chars | |
| Län (5 bits) + in-län index (6 bits)... per kommun | ~11 bits | similar to indices | more complex |

Base64url expands binary by 4/3 (6 bits per char) [derived].

### base64url
Alphabet is base64 with `-` and `_` for values 62 and 63; padding can be omitted when length is implicit [primary: RFC 4648 s5, https://www.rfc-editor.org/rfc/rfc4648#section-5]. URL-safe with no escaping. `btoa`/`atob` are standard-base64 only and need character swaps; `Uint8Array.toBase64({alphabet:"base64url"})` exists in newer engines but check support before relying on it [not verified here].

### deflate-raw via CompressionStream
`CompressionStream` accepts `"brotli"`, `"deflate"`, `"deflate-raw"`, `"gzip"` [primary: https://compression.spec.whatwg.org/]. MDN marks it Baseline widely available since May 2023 [primary: https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream]. The API is async (streams), so decoding the URL needs an `await` before first render. For ~100 bytes of already dense or near-random data, deflate gains nothing and can grow it (block header overhead); it helps only for the readable-text scheme (repeated separators and mode strings). Not worth it at this size [derived]. Note `brotli` support in browsers is less established than the others; I did not verify.

### lz-string
Library by pieroxy, MIT licensed; has a URL-safe `compressToEncodedURIComponent` (I could not confirm this from the repo README via fetch; it is documented in the project's site/README). Version 1.3.8 changed the encoding slightly, and v2 changed file layout [primary: https://github.com/pieroxy/lz-string]. Adds a dependency, shares deflate's problem of poor gains on tiny/dense input, and has sync API (simpler than CompressionStream). No release listing on the repo page, so maintenance status is unclear.

### Custom bit-packing
Smallest and no dependency, but needs a hand-written, versioned codec (see below) and tests. At 9 bits per kommun index, a 20-puzzle list is under 90 chars. Not human-readable.

### Plain text
Decimal codes with separators are ~2-3x larger than packed but still far below every limit, are debuggable, and have no codec versioning issue beyond the format prefix. Whether the size gain of packing matters is a product question; nothing in the limits above forces it.

### Whichever is chosen: cheap safeguards [derived]
- Leading format/version character so the codec can evolve.
- Optionally a short checksum to reject truncated links (messengers can cut a URL at punctuation).
- Cap on list length enforced on decode; validate every code against the loaded graph.

## 3. Serving it from this repo's Worker

Repo facts: `cloudflare.config.ts` uses `defineConfig` from `cf/config` with `worker: { name: "akle", compatibilityDate: "2026-10-23", domains: [...] }` and no `assets` block visible. `vite.config.ts` uses `@cloudflare/vite-plugin`. `public/_headers` sets `/assets/*` immutable, and `/` and `/index.html` `no-cache`. `src/` has no router today (no `location`/`history` use found). I did not find where `not_found_handling` is set for this config (the `cf/config` schema is not documented in the places I looked); check whether `cf/config` defaults it or exposes an `assets` option.

### SPA fallback
- Setting `assets.not_found_handling = "single-page-application"` makes Workers serve `/index.html` with `200 OK` for unmatched requests; with no HTML present, a 404 with empty body [primary: https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/].
- Navigation requests (`Sec-Fetch-Mode: navigate`) get the HTML without invoking a Worker script, for compat date 2025-04-01 or later (this repo: 2026-10-23); asset requests are free and unlimited, Worker invocations are billed [primary: same page; https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/]. An assets-only Worker has no script, so there is nothing to bill.
- Side effect: a *non-navigation* `fetch` to a path that does not exist also gets `index.html` with 200 rather than 404 (relevant if the app ever fetches optional JSON that may be missing). The docs describe this for API routes in the Worker-present case; for a pure assets Worker I infer the same [derived].
- Query strings: the docs do not state rules about them. Assets match on path, so `/p/abc?x=1` falls back to index.html like `/p/abc`; confirm with a deployed Preview [derived, verify].

### Path vs hash vs query
| | Path (`/p/<payload>`) | Query (`/?p=<payload>`) | Hash (`/#<payload>`) |
|---|---|---|---|
| Needs SPA fallback | yes | no (`/` exists) | no |
| Sent to server / counts to 16 KB limit | yes | yes | no |
| Appears in access logs/Referer | yes | yes | no |
| Survives `html_handling` redirects | path may be redirected | yes | hash preserved by browsers on redirect |
| Needs router change | client route | read `location.search` | read `location.hash` |

`html_handling` defaults to `auto-trailing-slash`: `/file/` -> 307 to `/file`, `/folder` -> 307 to `/folder/` when a matching file/folder exists [primary: https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/]. With a fallback path like `/p/xyz` where nothing matches, no redirect applies, but avoid payload paths that collide with files in `dist/`. Query and hash options sidestep all of this since `/` always exists.

### Caching and headers
- Default asset header is `Cache-Control: public, max-age=0, must-revalidate` with a content-hash ETag [primary: https://developers.cloudflare.com/workers/static-assets/headers/].
- `_headers`: up to 100 rules, 2000 chars per line; headers are not applied to responses generated by Worker code [primary: same page]. The docs do not say whether `_headers` rules for `/index.html` apply to the SPA-fallback response served for another path. This matters: this repo's `no-cache` rule is on `/` and `/index.html`; a fallback response for `/p/abc` might get the default `must-revalidate` (equivalent in effect) or nothing [unverified, test on a Preview with `curl -I`].
- Every playlist URL serving the same HTML means the CDN/browser caches per URL; with distinct payloads each is a separate cache entry but the body is identical and tiny, so no practical concern [derived].
- The existing `https://:preview.:subdomain.workers.dev/*` `X-Robots-Tag: noindex` rule is unaffected.

## 4. Graph version implications (ADR 0004)

ADR 0004: data is versioned by puzzle number, a version is never edited once used, and everyone on the same puzzle number gets the same version. A custom playlist's puzzles are not daily puzzles, so the open question is which version they are *played against*; not decided here. Encoding implications:

- **Codes** are stable identifiers across versions as long as a kommun keeps its code; a merge/split on 1 January removes or introduces codes, so a link containing a removed code is invalid under the newer version and still valid under the old.
- **Indices** (position in the sorted `kommuner.csv`, or in a version's list) shift whenever a kommun is added or removed and are only meaningful together with the graph version. A link using indices must carry a graph version id (e.g. `osm-2026-10-01` -> short number) or break silently. Costs extra bytes but is small (1 byte).
- Either scheme benefits from carrying a **graph version tag** in the payload so the app can decide: load that version, or reject/validate against the newest. The app already loads one version as a unit on demand (ADR 0004), so loading a tagged version is consistent with it.
- Shortest-route length N and other derived values must not be stored in the link as authoritative; they depend on the graph version [derived from ADR 0004, GLOSSARY "Graph version"].
- Decoder must validate every start/destination against the chosen version and have a defined failure mode for unknown codes.

## 5. Open items to verify empirically

1. How WhatsApp, iMessage, Messenger, Discord, Slack linkify a URL containing `-`, `_`, `.`, `~`, `=` and a trailing character; and any truncation of very long URLs.
2. Whether `_headers` applies to SPA-fallback responses (and what `cf/config` sets for `assets`).
3. Firefox and Safari practical URL ceilings (not documented).
4. Support of `Uint8Array.toBase64` / `fromBase64` in target browsers.
