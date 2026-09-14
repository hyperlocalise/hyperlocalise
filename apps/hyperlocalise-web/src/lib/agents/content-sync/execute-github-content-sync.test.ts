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

import { isErr, isOk } from "@/lib/primitives/result/results";

import type { ContentSyncConfig } from "./content-sync-types";

const mocks = vi.hoisted(() => ({
  selectLimit: vi.fn(),
  selectWhere: vi.fn(),
  resolveDefaultBranchHeadSha: vi.fn(),
  createGithubRepositoryAutomationSandbox: vi.fn(),
  stopGithubRepositoryAutomationSandbox: vi.fn(),
  runSandboxCommand: vi.fn(),
  uploadRepositorySourceFilesFromSandbox: vi.fn(),
  canPushToGitHubRepository: vi.fn(),
  loadProjectTranslationsAsPrefilledEntries: vi.fn(),
  hasDiffAgainstBase: vi.fn(),
  commitPushAndCreatePullTranslationsPullRequest: vi.fn(),
}));

vi.mock("@/lib/database/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: (...args: unknown[]) => {
          const rowsPromise = Promise.resolve(mocks.selectWhere(...args));
          return Object.assign(rowsPromise, {
            limit: mocks.selectLimit,
          });
        },
      })),
    })),
  },
  schema: {
    githubInstallationRepositories: {
      id: "id",
      organizationId: "organizationId",
    },
    projects: {
      id: "id",
      organizationId: "organizationId",
      targetLocales: "targetLocales",
    },
    repositorySourceFiles: {
      organizationId: "organizationId",
      projectId: "projectId",
      sourcePath: "sourcePath",
    },
  },
}));

vi.mock("@/lib/agents/github/github-repository-automation-sandbox", () => ({
  createGithubRepositoryAutomationSandbox: (...args: unknown[]) =>
    mocks.createGithubRepositoryAutomationSandbox(...args),
  resolveDefaultBranchHeadSha: (...args: unknown[]) => mocks.resolveDefaultBranchHeadSha(...args),
  stopGithubRepositoryAutomationSandbox: (...args: unknown[]) =>
    mocks.stopGithubRepositoryAutomationSandbox(...args),
}));

vi.mock("@/lib/translation/sandbox", () => ({
  runSandboxCommand: (...args: unknown[]) => mocks.runSandboxCommand(...args),
}));

vi.mock("@/lib/file-storage/upload-repository-source-files", () => ({
  uploadRepositorySourceFilesFromSandbox: (...args: unknown[]) =>
    mocks.uploadRepositorySourceFilesFromSandbox(...args),
}));

vi.mock("@/lib/agents/repository-write-gate", () => ({
  canPushToGitHubRepository: (...args: unknown[]) => mocks.canPushToGitHubRepository(...args),
}));

vi.mock("@/lib/projects/translations/project-translation-service", () => ({
  loadProjectTranslationsAsPrefilledEntries: (...args: unknown[]) =>
    mocks.loadProjectTranslationsAsPrefilledEntries(...args),
}));

vi.mock("@/lib/agents/github/github-repository-automation-pull-translations-pr", () => ({
  commitPushAndCreatePullTranslationsPullRequest: (...args: unknown[]) =>
    mocks.commitPushAndCreatePullTranslationsPullRequest(...args),
  hasDiffAgainstBase: (...args: unknown[]) => mocks.hasDiffAgainstBase(...args),
}));

vi.mock("@/lib/agents/github/github-repository-automation-pull-translations-branch", () => ({
  buildPullTranslationsBranchName: (runId: string) => `content-sync/${runId}`,
}));

vi.mock("@/lib/log", () => ({
  createLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { executeGithubContentSync } from "./execute-github-content-sync";

const ORG_ID = "org-1";
const PROJECT_ID = "project-1";
const AUTOMATION_ID = "automation-1";
const RUN_ID = "run-1";
const CONNECTION_ID = "22222222-2222-4222-8222-222222222222";

const syncConfig: ContentSyncConfig = {
  provider: "github",
  connectionId: CONNECTION_ID,
  resourceKey: "acme/web",
  providerFolder: "locales",
  projectFolder: "github/acme/web",
};

function repository(overrides?: Record<string, unknown>) {
  return {
    id: CONNECTION_ID,
    organizationId: ORG_ID,
    enabled: true,
    archived: false,
    fullName: "acme/web",
    defaultBranch: "main",
    githubInstallationId: "12345",
    githubRepositoryId: "repo-1",
    ...overrides,
  };
}

async function runSync(config: ContentSyncConfig = syncConfig) {
  return executeGithubContentSync({
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    automationId: AUTOMATION_ID,
    runId: RUN_ID,
    syncConfig: config,
  });
}

async function pullThenPush(options?: {
  targetLocales?: string[];
  sourceFiles?: { sourcePath: string }[];
  canPush?: boolean;
  prefilled?: { translatedKeyCount: number; prefilled: Record<string, string> };
  hasDiff?: boolean;
  pullRequestUrl?: string;
  repositoryOverrides?: Record<string, unknown>;
}) {
  mocks.selectLimit
    .mockResolvedValueOnce([repository(options?.repositoryOverrides)])
    .mockResolvedValueOnce([{ targetLocales: options?.targetLocales ?? ["fr"] }]);
  mocks.selectWhere.mockResolvedValue(
    options?.sourceFiles ?? [{ sourcePath: "github/acme/web/en.json" }],
  );
  mocks.runSandboxCommand.mockResolvedValue({
    exitCode: 0,
    output: "locales/en.json\0",
  });
  mocks.uploadRepositorySourceFilesFromSandbox.mockResolvedValue([{ outcome: "uploaded" }]);
  mocks.canPushToGitHubRepository.mockResolvedValue({ canPush: options?.canPush ?? true });
  mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue(
    options?.prefilled ?? {
      translatedKeyCount: 1,
      prefilled: { greeting: "Bonjour" },
    },
  );
  mocks.hasDiffAgainstBase.mockResolvedValue(options?.hasDiff ?? true);
  mocks.commitPushAndCreatePullTranslationsPullRequest.mockResolvedValue({
    pullRequestUrl: options?.pullRequestUrl ?? "https://github.com/acme/web/pull/9",
  });
  return runSync();
}

describe("executeGithubContentSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveDefaultBranchHeadSha.mockResolvedValue({ sha: "abc123", branch: "main" });
    mocks.createGithubRepositoryAutomationSandbox.mockResolvedValue("sbx-1");
    mocks.stopGithubRepositoryAutomationSandbox.mockResolvedValue(undefined);
    mocks.canPushToGitHubRepository.mockResolvedValue({ canPush: false });
    mocks.selectWhere.mockResolvedValue([]);
  });

  it("returns content_sync_connection_required when the repository is missing", async () => {
    mocks.selectLimit.mockResolvedValue([]);

    const result = await runSync();

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toMatchObject({
        code: "content_sync_connection_required",
        message: expect.stringContaining("Connect this provider"),
      });
    }
    expect(mocks.createGithubRepositoryAutomationSandbox).not.toHaveBeenCalled();
    expect(mocks.stopGithubRepositoryAutomationSandbox).not.toHaveBeenCalled();
  });

  it("returns content_sync_connection_required when the repository is disabled", async () => {
    mocks.selectLimit.mockResolvedValue([repository({ enabled: false })]);

    const result = await runSync();

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toMatchObject({
        code: "content_sync_connection_required",
        message: expect.stringContaining("Enable this repository"),
      });
    }
    expect(mocks.createGithubRepositoryAutomationSandbox).not.toHaveBeenCalled();
  });

  it("returns content_sync_connection_required when the repository is archived", async () => {
    mocks.selectLimit.mockResolvedValue([repository({ archived: true })]);

    const result = await runSync();

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("content_sync_connection_required");
    }
    expect(mocks.createGithubRepositoryAutomationSandbox).not.toHaveBeenCalled();
  });

  it("returns content_sync_connection_required for an invalid repository full name", async () => {
    mocks.selectLimit.mockResolvedValue([repository({ fullName: "invalid-name" })]);

    const result = await runSync();

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toMatchObject({
        code: "content_sync_connection_required",
        message: expect.stringContaining("invalid"),
      });
    }
    expect(mocks.createGithubRepositoryAutomationSandbox).not.toHaveBeenCalled();
  });

  it("returns content_sync_folder_invalid when git ls-files fails", async () => {
    mocks.selectLimit.mockResolvedValue([repository()]);
    mocks.runSandboxCommand.mockResolvedValue({ exitCode: 1, output: "" });

    const result = await runSync();

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toMatchObject({
        code: "content_sync_folder_invalid",
        message: expect.stringContaining("Could not list files"),
      });
    }
    expect(mocks.stopGithubRepositoryAutomationSandbox).toHaveBeenCalledWith("sbx-1");
  });

  it("returns content_sync_folder_invalid when the provider folder is missing", async () => {
    mocks.selectLimit.mockResolvedValue([repository()]);
    mocks.runSandboxCommand
      .mockResolvedValueOnce({ exitCode: 0, output: "" })
      .mockResolvedValueOnce({ exitCode: 1, output: "" });

    const result = await runSync();

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toMatchObject({
        code: "content_sync_folder_invalid",
        message: expect.stringContaining("not found"),
      });
    }
    expect(mocks.runSandboxCommand).toHaveBeenNthCalledWith(
      2,
      "sbx-1",
      "git",
      ["ls-files", "--error-unmatch", "locales"],
      { output: "stdout" },
    );
    expect(mocks.stopGithubRepositoryAutomationSandbox).toHaveBeenCalledWith("sbx-1");
  });

  it("returns content_sync_pull_failed when some source uploads fail", async () => {
    mocks.selectLimit.mockResolvedValue([repository()]);
    mocks.runSandboxCommand.mockResolvedValue({
      exitCode: 0,
      output: "locales/en.json\0",
    });
    mocks.uploadRepositorySourceFilesFromSandbox.mockResolvedValue([
      { outcome: "uploaded" },
      { outcome: "failed" },
    ]);

    const result = await runSync();

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toMatchObject({
        code: "content_sync_pull_failed",
        message: expect.stringContaining("failed to import"),
      });
    }
    expect(mocks.stopGithubRepositoryAutomationSandbox).toHaveBeenCalledWith("sbx-1");
  });

  it("stops the sandbox after a successful pull with push soft-skipped", async () => {
    mocks.selectLimit.mockResolvedValue([repository()]);
    mocks.runSandboxCommand.mockResolvedValue({
      exitCode: 0,
      output: "locales/en.json\0",
    });
    mocks.uploadRepositorySourceFilesFromSandbox.mockResolvedValue([
      { outcome: "uploaded" },
      { outcome: "skipped" },
    ]);

    const result = await runSync();

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({
        pulled: { uploaded: 1, skipped: 1, failed: 0 },
        pushed: { written: 0 },
      });
    }
    expect(mocks.canPushToGitHubRepository).toHaveBeenCalled();
    expect(mocks.stopGithubRepositoryAutomationSandbox).toHaveBeenCalledWith("sbx-1");
  });

  it("soft-no-ops push when githubInstallationId is not a finite number", async () => {
    const result = await pullThenPush({
      repositoryOverrides: { githubInstallationId: "not-a-number" },
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.pushed).toEqual({ written: 0 });
    }
    expect(mocks.canPushToGitHubRepository).not.toHaveBeenCalled();
    expect(mocks.loadProjectTranslationsAsPrefilledEntries).not.toHaveBeenCalled();
    expect(mocks.commitPushAndCreatePullTranslationsPullRequest).not.toHaveBeenCalled();
    expect(mocks.stopGithubRepositoryAutomationSandbox).toHaveBeenCalledWith("sbx-1");
  });

  it("soft-no-ops push when the project has no target locales", async () => {
    const result = await pullThenPush({ targetLocales: [] });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.pushed).toEqual({ written: 0 });
    }
    expect(mocks.loadProjectTranslationsAsPrefilledEntries).not.toHaveBeenCalled();
    expect(mocks.commitPushAndCreatePullTranslationsPullRequest).not.toHaveBeenCalled();
    expect(mocks.stopGithubRepositoryAutomationSandbox).toHaveBeenCalledWith("sbx-1");
  });

  it("soft-no-ops push when no translation candidates are ready", async () => {
    const result = await pullThenPush({
      prefilled: { translatedKeyCount: 0, prefilled: {} },
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.pushed).toEqual({ written: 0 });
    }
    expect(mocks.hasDiffAgainstBase).not.toHaveBeenCalled();
    expect(mocks.commitPushAndCreatePullTranslationsPullRequest).not.toHaveBeenCalled();
  });

  it("soft-no-ops push when the sandbox has no diff against the base", async () => {
    const result = await pullThenPush({ hasDiff: false });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.pushed).toEqual({ written: 0 });
    }
    expect(mocks.hasDiffAgainstBase).toHaveBeenCalled();
    expect(mocks.commitPushAndCreatePullTranslationsPullRequest).not.toHaveBeenCalled();
  });

  it("creates a translations pull request when push candidates differ from base", async () => {
    const result = await pullThenPush({
      pullRequestUrl: "https://github.com/acme/web/pull/42",
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.pushed).toEqual({
        written: 1,
        pullRequestUrl: "https://github.com/acme/web/pull/42",
      });
    }
    expect(mocks.commitPushAndCreatePullTranslationsPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: "sbx-1",
        repositoryFullName: "acme/web",
        branchName: "content-sync/run-1",
      }),
    );
    expect(mocks.stopGithubRepositoryAutomationSandbox).toHaveBeenCalledWith("sbx-1");
  });
});
