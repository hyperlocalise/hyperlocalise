import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { I18nSetupRequestedEventData } from "@/lib/agents/i18n-setup/i18n-setup-task";

const { canPushToGitHubRepositoryMock, getInstallationOctokitMock, runSandboxCommandMock } =
  vi.hoisted(() => ({
    canPushToGitHubRepositoryMock: vi.fn(),
    getInstallationOctokitMock: vi.fn(),
    runSandboxCommandMock: vi.fn(),
  }));

vi.mock("@/lib/agents/github/app", () => ({
  getInstallationOctokit: getInstallationOctokitMock,
}));

vi.mock("@/lib/agents/repository-write-gate", () => ({
  canPushToGitHubRepository: canPushToGitHubRepositoryMock,
}));

vi.mock("@/workflows/steps/sandbox-utils", () => ({
  runSandboxCommand: runSandboxCommandMock,
}));

import { commitPushAndCreateI18nSetupPullRequestStep } from "@/workflows/steps/i18n-setup-github";

const event: I18nSetupRequestedEventData = {
  runId: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-000000000002",
  actorUserId: "00000000-0000-4000-8000-000000000003",
  installationId: 123,
  repositoryOwner: "acme",
  repositoryName: "app",
  repositoryFullName: "acme/app",
  githubRepositoryId: "456",
  baseBranch: "main",
};

describe("commitPushAndCreateI18nSetupPullRequestStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInstallationOctokitMock.mockResolvedValue({
      rest: {
        pulls: {
          create: vi.fn(),
        },
      },
    });
    canPushToGitHubRepositoryMock.mockResolvedValue({ canPush: true });
    runSandboxCommandMock.mockResolvedValue({ exitCode: 0, output: "" });
  });

  it("throws the controlled write-gate reason when GitHub permission verification fails", async () => {
    canPushToGitHubRepositoryMock.mockResolvedValue({
      canPush: false,
      reason: "Could not verify push permission: API unavailable",
    });

    await expect(
      commitPushAndCreateI18nSetupPullRequestStep({
        event,
        sandboxId: "sandbox_123",
        branchName: "hyperlocalise/i18n-setup-123",
        summary: "",
        mode: "create",
        removeJsonc: false,
      }),
    ).rejects.toThrow("Could not verify push permission: API unavailable");

    expect(canPushToGitHubRepositoryMock).toHaveBeenCalledWith({
      installationId: 123,
      repositoryFullName: "acme/app",
    });
    expect(runSandboxCommandMock).not.toHaveBeenCalled();
  });
});
