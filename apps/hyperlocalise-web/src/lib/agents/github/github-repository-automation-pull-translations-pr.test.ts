/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  pullsList: vi.fn(),
  pullsCreate: vi.fn(),
  pullsUpdate: vi.fn(),
  getRef: vi.fn(),
  runSandboxCommand: vi.fn(),
}));

vi.mock("@/lib/agents/github/app", () => ({
  getInstallationOctokit: async () => ({
    rest: {
      pulls: { list: mocks.pullsList, create: mocks.pullsCreate, update: mocks.pullsUpdate },
      git: { getRef: mocks.getRef },
    },
  }),
}));

vi.mock("@/lib/agents/github/github-repository-automation-sandbox", () => ({
  prepareGithubRepositoryAutomationSandboxForPush: vi.fn(async () => undefined),
  runGitDiffInSandbox: vi.fn(),
}));

vi.mock("@/lib/agents/github/github-repository-automation-check-run", () => ({
  buildGithubRepositoryAutomationJobDetailsUrl: () => undefined,
}));

vi.mock("@/lib/translation/sandbox", () => ({
  runSandboxCommand: mocks.runSandboxCommand,
  writeFilesToSandbox: vi.fn(async () => undefined),
}));

import { commitPushAndCreatePullTranslationsPullRequest } from "./github-repository-automation-pull-translations-pr";

const BRANCH = "hyperlocalise/translations-sync-1";

function pushInput(overrides: { reuseBranch?: boolean } = {}) {
  return {
    sandboxId: "sbx-1",
    installationId: "123",
    repositoryFullName: "acme/web",
    automationJobId: "run-1",
    organizationSlug: null,
    githubRepositoryId: "repo-1",
    baseBranch: "main",
    baseSha: "base-sha",
    branchName: BRANCH,
    paths: ["locales/fr.json"],
    candidates: [],
    linkedTranslationJobIds: [],
    reuseBranch: true,
    ...overrides,
  };
}

function gitCall(subcommand: string) {
  const call = mocks.runSandboxCommand.mock.calls.find((args) => args[2]?.[0] === subcommand);
  return call?.[2] as string[] | undefined;
}

const openPull = {
  number: 5,
  html_url: "https://github.com/acme/web/pull/5",
  head: { sha: "pr-head" },
};

describe("commitPushAndCreatePullTranslationsPullRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runSandboxCommand.mockResolvedValue({ exitCode: 0, output: "" });
    mocks.pullsCreate.mockResolvedValue({
      data: { html_url: "https://github.com/acme/web/pull/8", number: 8 },
    });
  });

  it("overwrites a reused branch left behind by a merged or closed pull request", async () => {
    mocks.pullsList.mockResolvedValue({ data: [] });
    mocks.getRef.mockResolvedValue({ data: { object: { sha: "old-head" } } });

    const result = await commitPushAndCreatePullTranslationsPullRequest(pushInput());

    expect(gitCall("checkout")).toEqual(["checkout", "-B", BRANCH, "base-sha"]);
    expect(gitCall("push")).toEqual([
      "push",
      "-u",
      "origin",
      BRANCH,
      `--force-with-lease=refs/heads/${BRANCH}:old-head`,
    ]);
    expect(result).toMatchObject({ pullRequestNumber: 8, updated: false });
  });

  it("pushes a new reused branch plainly when none exists", async () => {
    mocks.pullsList.mockResolvedValue({ data: [] });
    mocks.getRef.mockRejectedValue(Object.assign(new Error("Not Found"), { status: 404 }));

    await commitPushAndCreatePullTranslationsPullRequest(pushInput());

    expect(gitCall("push")).toEqual(["push", "-u", "origin", BRANCH]);
  });

  it("rebuilds the open pull request's branch from the base when its files change", async () => {
    mocks.pullsList.mockResolvedValue({ data: [openPull] });
    mocks.runSandboxCommand.mockImplementation(
      async (_sandbox: string, _cmd: string, args: string[]) =>
        args[0] === "diff" ? { exitCode: 1, output: "" } : { exitCode: 0, output: "" },
    );

    const result = await commitPushAndCreatePullTranslationsPullRequest(pushInput());

    expect(mocks.getRef).not.toHaveBeenCalled();
    expect(gitCall("checkout")).toEqual(["checkout", "-B", BRANCH, "base-sha"]);
    expect(gitCall("reset")).toBeUndefined();
    expect(gitCall("push")).toContain(`--force-with-lease=refs/heads/${BRANCH}:pr-head`);
    expect(mocks.pullsUpdate).toHaveBeenCalled();
    expect(result).toMatchObject({ pullRequestNumber: 5, updated: true, pushed: true });
  });

  it("leaves the open pull request alone when its synced files would not change", async () => {
    mocks.pullsList.mockResolvedValue({ data: [openPull] });

    const result = await commitPushAndCreatePullTranslationsPullRequest(pushInput());

    expect(gitCall("fetch")).toEqual(["fetch", "--depth", "1", "origin", `refs/heads/${BRANCH}`]);
    expect(gitCall("diff")).toEqual([
      "diff",
      "--quiet",
      "FETCH_HEAD",
      "HEAD",
      "--",
      "locales/fr.json",
    ]);
    expect(gitCall("push")).toBeUndefined();
    expect(mocks.pullsUpdate).not.toHaveBeenCalled();
    expect(result).toEqual({
      pullRequestUrl: "https://github.com/acme/web/pull/5",
      pullRequestNumber: 5,
      updated: false,
      pushed: false,
    });
  });

  it("keeps a branch per job for callers that do not reuse branches", async () => {
    mocks.pullsList.mockResolvedValue({ data: [] });

    await commitPushAndCreatePullTranslationsPullRequest(pushInput({ reuseBranch: false }));

    expect(mocks.getRef).not.toHaveBeenCalled();
    expect(gitCall("checkout")).toEqual(["checkout", "-b", BRANCH]);
    expect(gitCall("push")).toEqual(["push", "-u", "origin", BRANCH]);
    expect(gitCall("fetch")).toBeUndefined();
  });
});
