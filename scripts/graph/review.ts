// bun run graph:review   rewrites the newest graph version's neighbors.csv and data/graph-report.md
// bun run graph:check    fails unless they're up to date and every flagged pair has a verdict
// Both read only committed files: the build's evidence and data/neighbor-overrides.yaml (ADR 0003).
import { readCommittedGraphVersions } from "../graphVersionData";
import {
  checkNeighborGraphReview,
  neighborGraphReview,
  overridesPath,
  reportPath,
} from "./neighborGraphReview";

const check = process.argv.includes("--check");
const versions = (await readCommittedGraphVersions()).sort(
  (a, b) => b.startsAtPuzzle - a.startsAtPuzzle,
);
const [newest, previous] = versions;
if (newest === undefined) throw new Error("No graph version in data/graphs/");

const readFiles = async (version: (typeof versions)[number]) =>
  Object.fromEntries(
    await Promise.all(
      Object.keys(version.files).map(async (name) => [
        name,
        await Bun.file(`data/graphs/${version.id}/${name}`).text(),
      ]),
    ),
  ) as Record<string, string>;

const input = {
  files: await readFiles(newest),
  overridesYaml: await Bun.file(overridesPath).text(),
  previous: previous && (await readFiles(previous)),
};

if (check) {
  const reportFile = Bun.file(reportPath);
  const problems = checkNeighborGraphReview({
    ...input,
    committedReport: (await reportFile.exists()) ? await reportFile.text() : "",
  });
  if (problems.length > 0) {
    console.error(`Neighbor graph check of ${newest.id} failed (${problems.length}):`);
    for (const problem of problems) console.error(`- ${problem}`);
    console.error(`See ${reportPath} and data/README.md.`);
    process.exit(1);
  }
  console.log(`Neighbor graph check passed for ${newest.id}.`);
} else {
  const { neighbors, report, review, problems } = neighborGraphReview(input);
  await Bun.write(`data/graphs/${newest.id}/neighbors.csv`, neighbors);
  await Bun.write(reportPath, report);
  const unreviewed = review.flags.filter((flag) => flag.verdict === undefined).length;
  console.log(
    `Wrote data/graphs/${newest.id}/neighbors.csv and ${reportPath}: ${review.flags.length} flagged pairs, ${unreviewed} without a verdict.`,
  );
  if (problems.length > 0) {
    console.error(`${problems.length} problems left; bun run graph:check will fail.`);
    process.exit(1);
  }
}
