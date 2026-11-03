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

function pushInput() {
  return {
    sandboxId: "sbx-1",
    installationId: "123",
    repositoryFullName: "acme/web",
    automationJobId: "run-1",
    organizationSlug: null,
    githubRepositoryId: "repo-1",
    baseBranch: "main",
    baseSha: "base-sha",
    branchName: "hyperlocalise/translations-sync-1",
    paths: ["locales/fr.json"],
    candidates: [],
    linkedTranslationJobIds: [],
  };
}

function pushArgs() {
  const call = mocks.runSandboxCommand.mock.calls.find((args) => args[2]?.[0] === "push");
  return call?.[2] as string[] | undefined;
}

describe("commitPushAndCreatePullTranslationsPullRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runSandboxCommand.mockResolvedValue({ exitCode: 0, output: "" });
    mocks.pullsCreate.mockResolvedValue({
      data: { html_url: "https://github.com/acme/web/pull/8", number: 8 },
    });
  });

  it("overwrites a branch left behind by a merged or closed pull request", async () => {
    mocks.pullsList.mockResolvedValue({ data: [] });
    mocks.getRef.mockResolvedValue({ data: { object: { sha: "old-head" } } });

    const result = await commitPushAndCreatePullTranslationsPullRequest(pushInput());

    expect(pushArgs()).toEqual([
      "push",
      "-u",
      "origin",
      "hyperlocalise/translations-sync-1",
      "--force-with-lease=refs/heads/hyperlocalise/translations-sync-1:old-head",
    ]);
    expect(result).toMatchObject({ pullRequestNumber: 8, updated: false });
  });

  it("pushes a new branch plainly when none exists", async () => {
    mocks.pullsList.mockResolvedValue({ data: [] });
    mocks.getRef.mockRejectedValue(Object.assign(new Error("Not Found"), { status: 404 }));

    await commitPushAndCreatePullTranslationsPullRequest(pushInput());

    expect(pushArgs()).toEqual(["push", "-u", "origin", "hyperlocalise/translations-sync-1"]);
  });

  it("updates the open pull request on the same branch", async () => {
    mocks.pullsList.mockResolvedValue({
      data: [
        { number: 5, html_url: "https://github.com/acme/web/pull/5", head: { sha: "pr-head" } },
      ],
    });

    const result = await commitPushAndCreatePullTranslationsPullRequest(pushInput());

    expect(mocks.getRef).not.toHaveBeenCalled();
    expect(pushArgs()).toContain(
      "--force-with-lease=refs/heads/hyperlocalise/translations-sync-1:pr-head",
    );
    expect(mocks.pullsUpdate).toHaveBeenCalled();
    expect(result).toMatchObject({ pullRequestNumber: 5, updated: true });
  });
});
