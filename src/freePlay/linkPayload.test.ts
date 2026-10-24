import { describe, expect, test } from "bun:test";
import {
  decodeLinkPayload,
  encodeLinkPayload,
  type LinkedTrip,
  type LinkPayload,
} from "./linkPayload";

const standardTrip: LinkPayload = {
  versionOrdinal: 0,
  trips: [{ start: "0180", destination: "1280", mode: { kind: "standard" } }],
};

/**
 * Format version 1 links as released, packed by hand (an independent script) from their fields.
 * They must keep decoding to these trips for as long as Åkle runs: never edit or remove one.
 */
const GOLDEN_V1: [string, LinkPayload][] = [
  ["EAIFoKACI", standardTrip],
  [
    "EMIGAUMKM",
    {
      versionOrdinal: 3,
      trips: [{ start: "0192", destination: "2584", mode: { kind: "unlimited" } }],
    },
  ],
  [
    "EEIDkD0RXk",
    {
      versionOrdinal: 1,
      trips: [{ start: "0114", destination: "0488", mode: { kind: "timed", thinkingTime: 10 } }],
    },
  ],
  [
    "H8IoABaYG",
    {
      versionOrdinal: 63,
      trips: [{ start: "1280", destination: "0180", mode: { kind: "tie-breaker" } }],
    },
  ],
  [
    "EIYFoKAAoAUMXhQwBgdq",
    {
      versionOrdinal: 2,
      trips: [
        { start: "0180", destination: "1280", mode: { kind: "standard" } },
        { start: "1280", destination: "2584", mode: { kind: "timed", thinkingTime: 60 } },
        { start: "2584", destination: "0192", mode: { kind: "tie-breaker" } },
      ],
    },
  ],
];

describe("the link payload", () => {
  test("round-trips a standard trip as unpadded base64url", () => {
    const text = encodeLinkPayload(standardTrip);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeLinkPayload(text)).toEqual({ ok: true, payload: standardTrip });
  });

  test.each([
    { kind: "standard" },
    { kind: "unlimited" },
    { kind: "timed", thinkingTime: 5 },
    { kind: "timed", thinkingTime: 10 },
    { kind: "timed", thinkingTime: 60 },
    { kind: "tie-breaker" },
  ] as const)("round-trips mode %o", (mode) => {
    const payload = { versionOrdinal: 5, trips: [{ ...standardTrip.trips[0], mode }] };
    expect(decodeLinkPayload(encodeLinkPayload(payload))).toEqual({ ok: true, payload });
  });

  test("round-trips an itinerary of 20 trips, each with its own mode", () => {
    const modes = [
      { kind: "standard" },
      { kind: "unlimited" },
      { kind: "timed", thinkingTime: 23 },
      { kind: "tie-breaker" },
    ] as const;
    const trips: LinkedTrip[] = Array.from({ length: 20 }, (_, index) => ({
      start: String(114 + index).padStart(4, "0"),
      destination: String(2584 - index).padStart(4, "0"),
      mode: modes[index % modes.length],
    }));
    const payload = { versionOrdinal: 63, trips };
    const text = encodeLinkPayload(payload);
    expect(text.length).toBeLessThanOrEqual(110);
    expect(decodeLinkPayload(text)).toEqual({ ok: true, payload });
  });

  test("writes format version 1", () => {
    expect(encodeLinkPayload(standardTrip)).toBe("EAIFoKACI");
  });

  test.each(GOLDEN_V1)("golden v1 link %s keeps decoding to its trips", (text, payload) => {
    expect(decodeLinkPayload(text)).toEqual({ ok: true, payload });
  });

  test("leaves the trip count to the link: none, or a code past 9999, still decode", () => {
    expect(decodeLinkPayload("EACu")).toEqual({
      ok: true,
      payload: { versionOrdinal: 0, trips: [] },
    });
    expect(decodeLinkPayload("EAIFp__hm")).toEqual({
      ok: true,
      payload: {
        versionOrdinal: 0,
        trips: [{ start: "0180", destination: "16383", mode: { kind: "standard" } }],
      },
    });
  });

  test("rejects a bad checksum", () => {
    // The last bit of the destination code flipped: 1280 becomes 1281.
    expect(decodeLinkPayload("EAIFoKICI")).toEqual({ ok: false, problem: "checksum" });
  });

  test.each([
    ["0", "AAIFoKAG0"],
    ["2, not yet released", "IAIFoKAHC"],
    ["14", "4AIFoKAD2"],
    ["15, reserved for a longer version field", "8AIFoKAHK"],
  ])("rejects format version %s", (_, text) => {
    expect(decodeLinkPayload(text)).toEqual({ ok: false, problem: "format-version" });
  });

  test.each([
    ["4 s", "EAIFoKAQgK"],
    ["61 s", "EAIFoKAXsc"],
  ])("rejects a thinking time of %s", (_, text) => {
    expect(decodeLinkPayload(text)).toEqual({ ok: false, problem: "thinking-time" });
  });

  test.each([
    ["empty", ""],
    ["not base64url", "EAIFoKAC+"],
    ["padded", "EAIFoKACI="],
    ["truncated", "EAIFoKAC"],
    ["too long", "EAIFoKACIA"],
    ["a set padding bit", "EAIFoKACJ"],
  ])("rejects a malformed payload: %s", (_, text) => {
    expect(decodeLinkPayload(text)).toEqual({ ok: false, problem: "malformed" });
  });

  test("refuses to encode what the format can't hold", () => {
    const trip = standardTrip.trips[0];
    expect(() => encodeLinkPayload({ versionOrdinal: 64, trips: [trip] })).toThrow(RangeError);
    expect(() =>
      encodeLinkPayload({ versionOrdinal: 0, trips: Array.from({ length: 32 }, () => trip) }),
    ).toThrow(RangeError);
    expect(() =>
      encodeLinkPayload({ versionOrdinal: 0, trips: [{ ...trip, start: "k00" }] }),
    ).toThrow(RangeError);
    expect(() =>
      encodeLinkPayload({
        versionOrdinal: 0,
        trips: [{ ...trip, mode: { kind: "timed", thinkingTime: 4 } }],
      }),
    ).toThrow(RangeError);
  });
});
