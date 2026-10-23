import type { ExtensionPullRequest } from "../src/schedule/runway";

/** An open PR from the extension branch, as `gh pr list --json ...` gives it. */
export type OpenPullRequest = {
  number: number;
  isCrossRepository: boolean;
  author: { login: string };
  commits: readonly { authors: readonly { login: string }[] }[];
};

/**
 * The extension PR the cron may update: one from this repo opened by the GitHub App `appSlug`.
 * Any other PR from a branch of the same name is ignored. A commit not authored by the App
 * makes it hand-edited.
 */
export function findExtensionPullRequest(
  pullRequests: readonly OpenPullRequest[],
  appSlug: string,
): ExtensionPullRequest | undefined {
  const own = pullRequests.find(
    (pullRequest) =>
      !pullRequest.isCrossRepository && pullRequest.author.login === `app/${appSlug}`,
  );
  if (!own) return undefined;
  const handEdited = own.commits.some(
    (commit) =>
      commit.authors.length === 0 ||
      commit.authors.some((author) => author.login !== `${appSlug}[bot]`),
  );
  return { number: own.number, handEdited };
}
