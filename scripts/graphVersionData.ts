import { parseGraphVersionHeader } from "../src/graph/graphVersionFiles";
import type { CommittedGraphVersion } from "../src/graph/frozenGraphVersions";
import { git } from "./scheduleData";

const graphsPath = "data/graphs/";

/** Every graph version in the working tree, with the git blob id of each file. */
export async function readCommittedGraphVersions(): Promise<CommittedGraphVersion[]> {
  const paths = [...new Bun.Glob("*/**").scanSync({ cwd: graphsPath, dot: true })]
    .map((path) => `${graphsPath}${path}`)
    .sort();
  const blobIds =
    paths.length === 0
      ? []
      : git(["hash-object", "--", ...paths])
          .trim()
          .split("\n");
  return committedVersionsFrom(
    paths.map((path, index) => ({ path, blobId: blobIds[index] })),
    async (path) => Bun.file(path).json(),
  );
}

/** Every graph version at a git revision; none if it has no graph versions. */
export async function readCommittedGraphVersionsAt(
  revision: string,
): Promise<CommittedGraphVersion[]> {
  const files = git(["ls-tree", "-r", revision, "--", graphsPath])
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [meta, path] = line.split("\t");
      return { path, blobId: meta.split(" ")[2] };
    });
  return committedVersionsFrom(files, async (path) =>
    JSON.parse(git(["show", `${revision}:${path}`])),
  );
}

async function committedVersionsFrom(
  files: { path: string; blobId: string }[],
  readJson: (path: string) => Promise<unknown>,
): Promise<CommittedGraphVersion[]> {
  const byDirectory = new Map<string, Record<string, string>>();
  for (const { path, blobId } of files) {
    const [directory, ...rest] = path.slice(graphsPath.length).split("/");
    if (rest.length === 0) continue;
    const directoryFiles = byDirectory.get(directory) ?? {};
    directoryFiles[rest.join("/")] = blobId;
    byDirectory.set(directory, directoryFiles);
  }
  return Promise.all(
    [...byDirectory]
      .filter(([, directoryFiles]) => "version.json" in directoryFiles)
      .map(async ([directory, directoryFiles]) => ({
        ...parseGraphVersionHeader(await readJson(`${graphsPath}${directory}/version.json`)),
        id: directory,
        files: directoryFiles,
      })),
  );
}
