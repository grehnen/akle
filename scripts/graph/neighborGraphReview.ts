import {
  graphVersionFileNames,
  parseGraphVersionHeader,
  parseKommunerFile,
  parseNeighborsFile,
} from "../../src/graph/graphVersionFiles";
import { readBuildEvidence } from "./buildEvidenceFiles";
import { graphReport } from "./graphReport";
import { neighborsFileContent } from "./graphVersionWriter";
import { readNeighborOverrides } from "./neighborOverrides";
import { reviewNeighborGraph, type NeighborReview } from "./neighborReview";

export const overridesPath = "data/neighbor-overrides.yaml";
export const reportPath = "data/graph-report.md";

export type NeighborGraphReviewInput = {
  /** The newest graph version's committed files, by file name. */
  files: Record<string, string>;
  overridesYaml: string;
  /** The files of the graph version before it, if any. */
  previous?: Record<string, string>;
};

/**
 * Reviews the newest graph version offline (ADR 0003): the build's committed evidence plus
 * `neighbor-overrides.yaml` give the shipped `neighbors.csv`, the report and the problems.
 */
export function neighborGraphReview({ files, overridesYaml, previous }: NeighborGraphReviewInput): {
  neighbors: string;
  report: string;
  review: NeighborReview;
  problems: string[];
} {
  const version = parseGraphVersionHeader(
    JSON.parse(files[graphVersionFileNames.version] ?? "null"),
  );
  const evidence = readBuildEvidence(files);
  let overrides: ReturnType<typeof readNeighborOverrides>;
  try {
    overrides = readNeighborOverrides(overridesYaml, evidence.kommuner);
  } catch (error) {
    throw new Error(`${overridesPath}: ${(error as Error).message}`, { cause: error });
  }
  const review = reviewNeighborGraph(evidence, overrides);
  const report = graphReport({
    version,
    kommuner: evidence.kommuner,
    review,
    previous: previous && {
      id: parseGraphVersionHeader(JSON.parse(previous[graphVersionFileNames.version])).id,
      kommuner: parseKommunerFile(previous[graphVersionFileNames.kommuner]),
      links: parseNeighborsFile(previous[graphVersionFileNames.neighbors]),
    },
  });
  return {
    neighbors: neighborsFileContent(review.links),
    report,
    review,
    problems: [...review.problems, ...review.graphProblems],
  };
}

/** What `bun run graph:check` fails on: review problems, or a graph or report out of date. */
export function checkNeighborGraphReview(
  input: NeighborGraphReviewInput & { committedReport: string },
): string[] {
  let result: ReturnType<typeof neighborGraphReview>;
  try {
    result = neighborGraphReview(input);
  } catch (error) {
    return [(error as Error).message];
  }
  const version = parseGraphVersionHeader(JSON.parse(input.files[graphVersionFileNames.version]));
  const problems = [...result.problems];
  if (result.neighbors !== input.files[graphVersionFileNames.neighbors]) {
    problems.push(
      `${version.id}/${graphVersionFileNames.neighbors} is out of date with ${overridesPath}; run bun run graph:review`,
    );
  }
  if (result.report !== input.committedReport) {
    problems.push(`${reportPath} is out of date; run bun run graph:review`);
  }
  return problems;
}
