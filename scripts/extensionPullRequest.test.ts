import { describe, expect, test } from "bun:test";
import { findExtensionPullRequest, type OpenPullRequest } from "./extensionPullRequest";

const bot = "akle-schedule";
const botCommit = { authors: [{ login: "akle-schedule[bot]" }] };
const humanCommit = { authors: [{ login: "grehnen" }] };

const pullRequest = (overrides: Partial<OpenPullRequest> = {}): OpenPullRequest => ({
  number: 12,
  isCrossRepository: false,
  author: { login: "app/akle-schedule" },
  commits: [botCommit],
  ...overrides,
});

describe("findExtensionPullRequest", () => {
  test("is undefined when no PR is open", () => {
    expect(findExtensionPullRequest([], bot)).toBeUndefined();
  });

  test("finds the App's own PR from this repo, with no hand edits", () => {
    expect(findExtensionPullRequest([pullRequest()], bot)).toEqual({
      number: 12,
      handEdited: false,
    });
  });

  test("ignores a PR from a fork, even one the App's name is on", () => {
    expect(
      findExtensionPullRequest([pullRequest({ isCrossRepository: true })], bot),
    ).toBeUndefined();
  });

  test("ignores a PR opened by anyone but the App", () => {
    expect(
      findExtensionPullRequest([pullRequest({ author: { login: "grehnen" } })], bot),
    ).toBeUndefined();
    expect(
      findExtensionPullRequest([pullRequest({ author: { login: "app/other-app" } })], bot),
    ).toBeUndefined();
  });

  test("skips PRs that aren't ours to find the App's own", () => {
    expect(
      findExtensionPullRequest(
        [pullRequest({ number: 7, isCrossRepository: true }), pullRequest({ number: 12 })],
        bot,
      ),
    ).toEqual({ number: 12, handEdited: false });
  });

  test("is hand-edited when any commit on the branch isn't authored by the App", () => {
    expect(
      findExtensionPullRequest([pullRequest({ commits: [botCommit, humanCommit] })], bot),
    ).toEqual({ number: 12, handEdited: true });
  });

  test("is hand-edited when a commit's author isn't a GitHub account GitHub can match", () => {
    expect(
      findExtensionPullRequest([pullRequest({ commits: [{ authors: [{ login: "" }] }] })], bot),
    ).toEqual({ number: 12, handEdited: true });
  });
});
