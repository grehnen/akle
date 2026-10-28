import { describe, expect, test } from "bun:test";
import { loadDailyTrip } from "../daily/loadDailyTrip";
import { committedDataSource } from "./committedDataSource";

/** Records which graph versions the app fetches. */
function recordingSource() {
  const fetched: string[] = [];
  const source = {
    ...committedDataSource,
    graphVersionFiles: async (id: string) => {
      fetched.push(id);
      return committedDataSource.graphVersionFiles(id);
    },
  };
  return { source, fetched };
}

const config = await committedDataSource.scheduleConfig();
const versions = [...(await committedDataSource.graphVersions())].sort(
  (a, b) => a.startsAtTrip - b.startsAtTrip,
);
const boundaries = versions.slice(1).map((version, index) => ({
  before: versions[index].id,
  after: version.id,
  trip: version.startsAtTrip,
}));

/** Local noon on the day of a trip number. */
function dayOf(tripNumber: number): Date {
  const [year, month, day] = config.epoch.split("-").map(Number);
  return new Date(year, month - 1, day + tripNumber - 1, 12);
}

describe("graph version boundaries in the committed data", () => {
  test("trip #1 loads the first graph version", async () => {
    const { source, fetched } = recordingSource();
    const daily = await loadDailyTrip(source, dayOf(1));
    expect(daily.kind === "trip" && daily.trip.number).toBe(1);
    expect(fetched).toEqual([versions[0].id]);
  });

  test.skipIf(boundaries.length === 0).each(boundaries)(
    "trip #$trip loads $after and the trip before it loads $before",
    async ({ before, after, trip }) => {
      for (const [tripNumber, expected] of [
        [trip - 1, before],
        [trip, after],
      ] as const) {
        const { source, fetched } = recordingSource();
        const daily = await loadDailyTrip(source, dayOf(tripNumber));
        if (daily.kind !== "trip") {
          throw new Error(
            `Trip #${tripNumber} is not in the schedule; run bun run schedule so it covers every version's start`,
          );
        }
        expect({ trip: daily.trip.number, graph: daily.graph.id, fetched }).toEqual({
          trip: tripNumber,
          graph: expected,
          fetched: [expected],
        });
      }
    },
  );
});
