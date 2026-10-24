import { describe, expect, test } from "bun:test";
import { itineraryLinkPath } from "./itineraryLink";
import { decodeLinkPayload, type LinkedTrip } from "./linkPayload";

const trips: LinkedTrip[] = [
  { start: "0192", destination: "0488", mode: { kind: "standard" } },
  { start: "0488", destination: "0136", mode: { kind: "timed", thinkingTime: 45 } },
  { start: "0192", destination: "0488", mode: { kind: "tie-breaker" } },
];

/** The link's path, its title and its decoded payload. */
function opened(link: string) {
  const url = new URL(link, "https://akle.example");
  return {
    path: url.pathname,
    title: url.searchParams.get("namn"),
    payload: decodeLinkPayload(url.searchParams.get("r") ?? ""),
  };
}

describe("an itinerary's link", () => {
  test("opens /resplan with its title, its version and its trips in order", () => {
    expect(opened(itineraryLinkPath(2, "Fredag & lördag?", trips))).toEqual({
      path: "/resplan",
      title: "Fredag & lördag?",
      payload: { ok: true, payload: { versionOrdinal: 2, trips } },
    });
  });

  test("carries no title when the itinerary has none", () => {
    const link = itineraryLinkPath(0, "  ", trips);
    expect(link).not.toContain("namn");
    expect(opened(link).payload).toEqual({ ok: true, payload: { versionOrdinal: 0, trips } });
  });

  test("trims the title", () => {
    expect(opened(itineraryLinkPath(0, " Fredagsresan ", trips)).title).toBe("Fredagsresan");
  });
});
