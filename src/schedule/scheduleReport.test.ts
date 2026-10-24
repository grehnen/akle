import { describe, expect, test } from "bun:test";
import type { ScheduledTrip } from "./schedule";
import { scheduleReport } from "./scheduleReport";
import { pathGraph } from "./testGraphs";

const row = (number: number, start: string, destination: string, n: number): ScheduledTrip => ({
  number,
  start,
  destination,
  n,
});

// On a line of six kommuner: N 3 has k00–k04 and k01–k05; N 4 has only k00–k05.
const graph = pathGraph(6);

describe("scheduleReport", () => {
  test("summarises the new rows with readable names for the PR body", () => {
    const report = scheduleReport(
      {
        rows: [row(1, "k00", "k04", 3), row(2, "k05", "k00", 4), row(3, "k04", "k00", 3)],
        reconciled: [{ before: row(1, "k01", "k05", 4), after: row(1, "k00", "k04", 3) }],
        added: [row(2, "k05", "k00", 4), row(3, "k04", "k00", 3)],
      },
      [graph],
    );
    expect(report).toBe(`## Schedule report

Added 2 trips (#2–#3) and reconciled 1 unplayed trip.

### N distribution of the added trips

| N | Trips |
| - | ----- |
| 3 | 1 |
| 4 | 1 |
| 5 | 0 |
| 6 | 0 |
| 7 | 0 |
| 8 | 0 |

### Endpoint use per kommun in the added trips

| Kommun | Times |
| ------ | ----- |
| Kommun k00 | 2 |
| Kommun k04 | 1 |
| Kommun k05 | 1 |
| Kommun k01 | 0 |
| Kommun k02 | 0 |
| Kommun k03 | 0 |

### Unused pairs left per N (graph version path)

| N | Unused | Pairs |
| - | ------ | ----- |
| 3 | 1 | 2 |
| 4 | 0 | 1 |
| 5 | 0 | 0 |
| 6 | 0 | 0 |
| 7 | 0 | 0 |
| 8 | 0 | 0 |

### Reconciled trips

| Trip | Before | After |
| ---- | ------ | ----- |
| #1 | Kommun k01 → Kommun k05 (N 4) | Kommun k00 → Kommun k04 (N 3) |

### Added trips

| Trip | Start | Destination | N |
| ---- | ----- | ----------- | - |
| #2 | Kommun k05 | Kommun k00 | 4 |
| #3 | Kommun k04 | Kommun k00 | 3 |
`);
  });

  test("says so when nothing changed", () => {
    expect(
      scheduleReport({ rows: [row(1, "k00", "k04", 3)], reconciled: [], added: [] }, [graph]),
    ).toContain("Added no trips and reconciled no unplayed trips.");
  });
});
