import { describe, expect, test } from "bun:test";
import {
  findScheduledTrip,
  formatScheduleChunks,
  parseScheduleChunk,
  parseScheduleConfig,
  scheduleChunkFor,
} from "./schedule";

describe("scheduleChunkFor", () => {
  test.each([
    [1, 1],
    [1000, 1],
    [1001, 2],
    [2500, 3],
  ])("trip #%d lives in chunk %d", (tripNumber, chunk) => {
    expect(scheduleChunkFor(tripNumber)).toBe(chunk);
  });
});

describe("parseScheduleChunk", () => {
  test("reads trip, start, destination and n rows", () => {
    const csv = "trip,start,destination,n\n1,0123,0192,3\n2,0120,0488,5\n";
    expect(parseScheduleChunk(csv)).toEqual([
      { number: 1, start: "0123", destination: "0192", n: 3 },
      { number: 2, start: "0120", destination: "0488", n: 5 },
    ]);
  });

  test("tolerates CRLF line endings and a missing final newline", () => {
    expect(parseScheduleChunk("trip,start,destination,n\r\n7,0123,0192,3")).toEqual([
      { number: 7, start: "0123", destination: "0192", n: 3 },
    ]);
  });

  test("rejects an unexpected header", () => {
    expect(() => parseScheduleChunk("day,from,to\n1,a,b\n")).toThrow(/header/);
  });

  test("rejects malformed rows", () => {
    expect(() => parseScheduleChunk("trip,start,destination,n\n1,0123,0192\n")).toThrow(/line 2/);
    expect(() => parseScheduleChunk("trip,start,destination,n\nx,0123,0192,3\n")).toThrow(/line 2/);
  });
});

describe("findScheduledTrip", () => {
  const rows = parseScheduleChunk("trip,start,destination,n\n1,0123,0192,3\n2,0120,0488,5\n");

  test("finds the row for a trip number", () => {
    expect(findScheduledTrip(rows, 2)?.start).toBe("0120");
  });

  test("returns undefined past the last row", () => {
    expect(findScheduledTrip(rows, 3)).toBeUndefined();
  });
});

describe("formatScheduleChunks", () => {
  test("writes one CSV file per 1,000 trips, with the header and a final newline", () => {
    const rows = [999, 1000, 1001].map((number) => ({
      number,
      start: "0123",
      destination: "0192",
      n: 3,
    }));
    expect(formatScheduleChunks(rows)).toEqual([
      {
        fileName: "0001.csv",
        csv: "trip,start,destination,n\n999,0123,0192,3\n1000,0123,0192,3\n",
      },
      { fileName: "0002.csv", csv: "trip,start,destination,n\n1001,0123,0192,3\n" },
    ]);
  });

  test("round-trips through parseScheduleChunk", () => {
    const csv = "trip,start,destination,n\n1,0123,0192,3\n2,0120,0488,5\n";
    expect(formatScheduleChunks(parseScheduleChunk(csv))).toEqual([{ fileName: "0001.csv", csv }]);
  });
});

describe("parseScheduleConfig", () => {
  test("defaults the endpoint cooldown to 30 days", () => {
    expect(parseScheduleConfig({ epoch: "2026-10-01", seed: "s" }).cooldownDays).toBe(30);
  });

  test("reads a shorter cooldown for small development graphs", () => {
    expect(
      parseScheduleConfig({ epoch: "2026-10-01", seed: "s", cooldownDays: 4 }).cooldownDays,
    ).toBe(4);
  });

  test("reads a cooldown per graph version, for small development graphs", () => {
    expect(
      parseScheduleConfig({
        epoch: "2026-10-01",
        seed: "s",
        cooldownDaysByGraphVersion: { fixture: 3 },
      }),
    ).toEqual({
      epoch: "2026-10-01",
      seed: "s",
      cooldownDays: 30,
      cooldownDaysByGraphVersion: { fixture: 3 },
      lanCooldownDays: 3,
      lanCooldownDaysByGraphVersion: {},
    });
  });

  test("defaults the län cooldown to 3 days, and reads one per graph version", () => {
    expect(parseScheduleConfig({ epoch: "2026-10-01", seed: "s" }).lanCooldownDays).toBe(3);
    expect(
      parseScheduleConfig({
        epoch: "2026-10-01",
        seed: "s",
        lanCooldownDays: 2,
        lanCooldownDaysByGraphVersion: { fixture: 0 },
      }),
    ).toMatchObject({ lanCooldownDays: 2, lanCooldownDaysByGraphVersion: { fixture: 0 } });
  });

  test("rejects a län cooldown that is not a whole number of days", () => {
    expect(() =>
      parseScheduleConfig({ epoch: "2026-10-01", seed: "s", lanCooldownDays: 0.5 }),
    ).toThrow(/lanCooldownDays/);
    expect(() =>
      parseScheduleConfig({
        epoch: "2026-10-01",
        seed: "s",
        lanCooldownDaysByGraphVersion: { fixture: -1 },
      }),
    ).toThrow(/lanCooldownDaysByGraphVersion/);
  });

  test("rejects a län cooldown for a graph version that doesn't exist", () => {
    expect(() =>
      parseScheduleConfig(
        { epoch: "2026-10-01", seed: "s", lanCooldownDaysByGraphVersion: { other: 1 } },
        { graphVersionIds: ["fixture"] },
      ),
    ).toThrow(/lanCooldownDaysByGraphVersion names graph versions that don't exist: other/);
  });

  test("rejects a cooldown that is not a whole number of days", () => {
    expect(() => parseScheduleConfig({ epoch: "2026-10-01", seed: "s", cooldownDays: -1 })).toThrow(
      /cooldownDays/,
    );
    expect(() =>
      parseScheduleConfig({
        epoch: "2026-10-01",
        seed: "s",
        cooldownDaysByGraphVersion: { fixture: 1.5 },
      }),
    ).toThrow(/cooldownDaysByGraphVersion/);
  });

  test.each([[[3]], [null], ["fixture"], [3]])(
    "rejects cooldownDaysByGraphVersion %p, which is not an object",
    (cooldownDaysByGraphVersion) => {
      expect(() =>
        parseScheduleConfig({ epoch: "2026-10-01", seed: "s", cooldownDaysByGraphVersion }),
      ).toThrow(/cooldownDaysByGraphVersion/);
    },
  );

  test("rejects a cooldown for a graph version that doesn't exist", () => {
    const config = {
      epoch: "2026-10-01",
      seed: "s",
      cooldownDaysByGraphVersion: { fixture: 3, "osm-2099-01-01": 5 },
    };
    expect(() => parseScheduleConfig(config, { graphVersionIds: ["fixture"] })).toThrow(
      /osm-2099-01-01/,
    );
    expect(
      parseScheduleConfig(config, { graphVersionIds: ["fixture", "osm-2099-01-01"] }),
    ).toMatchObject({ cooldownDaysByGraphVersion: { fixture: 3, "osm-2099-01-01": 5 } });
  });
});
