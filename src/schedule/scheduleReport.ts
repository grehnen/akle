import { type GraphVersion, type KommunCode } from "../graph/graphVersion";
import { graphVersionFor } from "../graph/graphVersionFiles";
import type { GeneratedSchedule } from "./generateSchedule";
import type { ScheduledTrip } from "./schedule";
import { pairKey } from "../graph/kommunPair";
import { maximumN, minimumN, pairsByN } from "./scheduleHistory";

/** The Markdown report for a schedule PR body: what was added and reconciled, and what is left. */
export function scheduleReport(
  schedule: GeneratedSchedule,
  graphs: readonly GraphVersion[],
): string {
  const { rows, reconciled, added } = schedule;
  const lastNumber = rows.at(-1)?.number ?? 1;
  const newest = graphVersionFor(graphs, lastNumber);
  if (!newest) throw new Error(`No graph version covers trip #${lastNumber}`);
  const name = (code: KommunCode, tripNumber: number) =>
    graphVersionFor(graphs, tripNumber)?.kommuner.get(code)?.name ?? code;
  const allN = Array.from({ length: maximumN - minimumN + 1 }, (_, i) => minimumN + i);

  const sections = [`## Schedule report\n\n${summary(added, reconciled.length)}`];

  sections.push(
    table(
      "N distribution of the added trips",
      ["N", "Trips"],
      allN.map((n) => [n, added.filter((row) => row.n === n).length]),
    ),
  );

  const endpointUses = new Map<KommunCode, number>(
    [...newest.kommuner.keys()].map((code) => [code, 0]),
  );
  for (const row of added) {
    for (const code of [row.start, row.destination]) {
      endpointUses.set(code, (endpointUses.get(code) ?? 0) + 1);
    }
  }
  const kommunName = (code: KommunCode) => newest.kommuner.get(code)?.name ?? code;
  sections.push(
    table(
      "Endpoint use per kommun in the added trips",
      ["Kommun", "Times"],
      [...endpointUses]
        .sort(
          ([a, aUses], [b, bUses]) =>
            bUses - aUses || kommunName(a).localeCompare(kommunName(b), "sv"),
        )
        .map(([code, uses]) => [kommunName(code), uses]),
    ),
  );

  const usedPairs = new Set(rows.map((row) => pairKey([row.start, row.destination])));
  const groups = pairsByN(newest);
  sections.push(
    table(
      `Unused pairs left per N (graph version ${newest.id})`,
      ["N", "Unused", "Pairs"],
      allN.map((n) => {
        const pairs = groups.get(n) ?? [];
        return [n, pairs.filter((key) => !usedPairs.has(key)).length, pairs.length];
      }),
    ),
  );

  const describe = (row: ScheduledTrip) =>
    `${name(row.start, row.number)} → ${name(row.destination, row.number)} (N ${row.n})`;
  if (reconciled.length > 0) {
    sections.push(
      table(
        "Reconciled trips",
        ["Trip", "Before", "After"],
        reconciled.map(({ before, after }) => [
          `#${before.number}`,
          describe(before),
          describe(after),
        ]),
      ),
    );
  }
  if (added.length > 0) {
    sections.push(
      table(
        "Added trips",
        ["Trip", "Start", "Destination", "N"],
        added.map((row) => [
          `#${row.number}`,
          name(row.start, row.number),
          name(row.destination, row.number),
          row.n,
        ]),
      ),
    );
  }
  return `${sections.join("\n\n")}\n`;
}

function summary(added: readonly ScheduledTrip[], reconciledCount: number): string {
  const addedText =
    added.length === 0
      ? "Added no trips"
      : `Added ${added.length} ${added.length === 1 ? "trip" : "trips"} (#${added[0].number}–#${added.at(-1)?.number})`;
  const reconciledText =
    reconciledCount === 0
      ? "reconciled no unplayed trips"
      : `reconciled ${reconciledCount} unplayed ${reconciledCount === 1 ? "trip" : "trips"}`;
  return `${addedText} and ${reconciledText}.`;
}

function table(title: string, headers: string[], rows: (string | number)[][]): string {
  const line = (cells: (string | number)[]) => `| ${cells.join(" | ")} |`;
  return [
    `### ${title}`,
    "",
    line(headers),
    line(headers.map((header) => "-".repeat(header.length))),
    ...rows.map(line),
  ].join("\n");
}
