import type { Kommun, KommunCode, NeighborLink } from "../../src/graph/graphVersion";
import type { GraphVersionHeader } from "../../src/graph/graphVersionFiles";
import { pairKey } from "../../src/graph/kommunPair";
import type { LinkFailure } from "./fixedLinks";
import type { NeighborReview, FlaggedPair, Point } from "./neighborReview";

export type GraphReportInput = {
  version: GraphVersionHeader;
  kommuner: readonly Kommun[];
  review: NeighborReview;
  /** The graph version before this one, for the changes since. */
  previous?: { id: string; kommuner: readonly Kommun[]; links: readonly NeighborLink[] };
};

/**
 * `data/graph-report.md` (ADR 0003): every flagged pair with its measurements, map link and
 * verdict, the problems that fail the check, and the pairs added or removed since the previous
 * graph version.
 */
export function graphReport({ version, kommuner, review, previous }: GraphReportInput): string {
  const names = new Map(kommuner.map((kommun) => [kommun.code, kommun.name]));
  const previousNames = new Map(previous?.kommuner.map((kommun) => [kommun.code, kommun.name]));
  const pairName = (between: readonly KommunCode[]) =>
    between.map((code) => names.get(code) ?? previousNames.get(code) ?? code).join("–");
  const count = (kind: NeighborLink["kind"]) =>
    review.links.filter((link) => link.kind === kind).length;
  const unreviewed = review.flaggedPairs.filter((flag) => flag.verdict === undefined).length;
  const problems = [...review.problems, ...review.graphProblems];

  const lines = [
    `# Neighbor graph report: ${version.id}`,
    "",
    "Written by `bun run graph:build` and `bun run graph:review` from the graph version and `data/neighbor-overrides.yaml` (ADR 0003). Don't edit it by hand: `bun run graph:check` fails when it's out of date.",
    "",
    `Graph version \`${version.id}\` starts at puzzle #${version.startsAtPuzzle}. ${kommuner.length} kommuner, ${new Set(review.links.map((link) => pairKey(link.between))).size} neighbor pairs: ${count("land")} land, ${count("fixed")} fixed, ${count("ferry")} ferry links.`,
    "",
    "## Problems",
    "",
    ...(problems.length === 0 ? ["None."] : problems.map((problem) => `- ${problem}`)),
    "",
    "## Flagged pairs",
    "",
    `${review.flaggedPairs.length} flagged pairs, ${unreviewed} without a verdict.`,
    "",
    "The pairs are split by what the build decided on its own; a keep verdict leaves that as it is, and the build column says which links it made.",
    "",
    ...flagTable(
      "Neighbors in the build",
      review.flaggedPairs.filter((flag) => flag.built.length > 0),
      pairName,
    ),
    ...flagTable(
      "Not neighbors in the build",
      review.flaggedPairs.filter((flag) => flag.built.length === 0),
      pairName,
    ),
    `## Changes since the previous graph version${previous ? ` (${previous.id})` : ""}`,
    "",
  ];
  if (previous === undefined) {
    lines.push("No previous graph version.");
  } else {
    const kindsByPair = (links: readonly NeighborLink[]) => {
      const byPair = new Map<string, { between: readonly KommunCode[]; kinds: string[] }>();
      for (const link of links) {
        const key = pairKey(link.between);
        const entry = byPair.get(key) ?? { between: key.split("-"), kinds: [] };
        entry.kinds.push(link.kind);
        byPair.set(key, entry);
      }
      return byPair;
    };
    const now = kindsByPair(review.links);
    const before = kindsByPair(previous.links);
    const listed = (pairs: Map<string, { between: readonly KommunCode[]; kinds: string[] }>) =>
      [...pairs]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(
          ([key, pair]) => `${pairName(pair.between)} (${key}, ${pair.kinds.sort().join(", ")})`,
        );
    const added = listed(new Map([...now].filter(([key]) => !before.has(key))));
    const removed = listed(new Map([...before].filter(([key]) => !now.has(key))));
    for (const [title, pairs] of [
      ["Added", added],
      ["Removed", removed],
    ] as const) {
      lines.push(`### ${title} (${pairs.length})`, "");
      lines.push(...(pairs.length === 0 ? ["None."] : pairs.map((pair) => `- ${pair}`)), "");
    }
    lines.pop();
  }
  return `${lines.join("\n")}\n`;
}

function measurements(flag: FlaggedPair, names: (codes: readonly KommunCode[]) => string): string {
  const parts: string[] = [];
  if (flag.landLength !== undefined) {
    const split =
      flag.islandLength === undefined
        ? ""
        : ` (${flag.mainlandLength} m mainland, ${flag.islandLength} m islands)`;
    parts.push(`land border ${flag.landLength} m${split}`);
  }
  if (flag.riverLength !== undefined) parts.push(`river border ${flag.riverLength} m`);
  if (flag.exclaveOf) {
    const owners = flag.exclaveOf.map((code) => names([code]));
    parts.push(
      owners.length === 1
        ? `all on an exclave of ${owners[0]}`
        : `all on exclaves of ${owners.join(" and ")}`,
    );
  }
  if (flag.ways) parts.push(`ways ${flag.ways.map(wayLink).join(" ")}`);
  if (flag.failures) {
    const failing = flag.failures.map(
      ({ way, reasons }) => `${wayLink(way)} ${reasons.map(failureText).join(", ")}`,
    );
    parts.push(
      flag.built.includes("fixed")
        ? `failing ways, the link qualifies through the others: ${failing.join(", ")}`
        : `not qualifying: ${failing.join(", ")}`,
    );
  }
  if (flag.kinds.includes("point-touch")) parts.push("touches at one point");
  return parts.join("; ");
}

function wayLink(way: number): string {
  return `[${way}](https://www.openstreetmap.org/way/${way})`;
}

function failureText(reason: LinkFailure): string {
  if (reason === "no-land-end") return "an end off the mainland and islands of 1 km² or more";
  if (reason === "exclave-end")
    return "an end on land off the main part of its kommun, such as an exclave";
  return reason;
}

function mapLink([lon, lat]: Point): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
}

function flagTable(
  title: string,
  flags: readonly FlaggedPair[],
  names: (codes: readonly KommunCode[]) => string,
): string[] {
  if (flags.length === 0) return [`### ${title} (0)`, "", "None.", ""];
  return [
    `### ${title} (${flags.length})`,
    "",
    "| Pair | Codes | Flags | Measurements | Map | Build | Verdict |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...flags.map(
      (flag) =>
        `| ${names(flag.between)} | ${pairKey(flag.between)} | ${flag.kinds.join(", ")} | ${measurements(flag, names)} | [map](${mapLink(flag.at)}) | ${builtText(flag)} | ${verdictText(flag)} |`,
    ),
    "",
  ];
}

function builtText({ built }: FlaggedPair): string {
  return built.length === 0 ? "not neighbors" : `neighbors (${built.join(", ")})`;
}

function verdictText({ verdict }: FlaggedPair): string {
  if (verdict === undefined) return "**none**";
  const evidence = verdict.action === "keep" ? "" : ` ([evidence](${verdict.evidence}))`;
  return `${verdict.action}: ${verdict.reason.replaceAll(/\s+/g, " ").trim().replaceAll("|", "\\|")}${evidence}`;
}
