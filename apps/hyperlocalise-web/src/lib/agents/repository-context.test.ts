import type { GitHubRawMessage } from "@chat-adapter/github";
import { describe, expect, it, vi } from "vite-plus/test";

const { getInstallationOctokitMock } = vi.hoisted(() => ({
  getInstallationOctokitMock: vi.fn(),
}));

vi.mock("./github/app", () => ({
  getInstallationOctokit: getInstallationOctokitMock,
}));

import {
  buildRepositoryGitHubContextInstructions,
  defaultRepositoryGitHubContextDependencies,
  extractGitHubPullRequestReferences,
  extractGitHubRepositoryFullNameReferences,
  resolveGitHubRepositoryGitHubContext,
  resolveSlackRepositoryGitHubContext,
  type RepositoryGitHubContextDependencies,
} from "./repository-context";

function createDependencies(
  overrides: Partial<RepositoryGitHubContextDependencies> = {},
): RepositoryGitHubContextDependencies {
  return {
    findEnabledRepository: vi.fn(async ({ repositoryFullName }) => ({
      installationId: 12345,
      repositoryFullName,
      defaultBranch: "main",
    })),
    listEnabledRepositories: vi.fn(async () => []),
    loadPullRequest: vi.fn(async () => ({
      branch: "feature/i18n",
      commitSha: "abc123",
    })),
    ...overrides,
  };
}

function createGitHubRawMessage(
  overrides: Partial<Extract<GitHubRawMessage, { type: "review_comment" }>> = {},
): GitHubRawMessage {
  return {
    type: "review_comment",
    repository: {
      id: 9001,
      name: "web",
      full_name: "acme/web",
      owner: { id: 1, login: "acme", type: "Organization" },
    },
    prNumber: 42,
    comment: {
      id: 555,
      body: "@hyperlocalise fix",
      commit_id: "comment-sha",
      created_at: "2026-05-20T00:00:00.000Z",
      diff_hunk: "@@",
      html_url: "https://github.com/acme/web/pull/42#discussion_r555",
      original_commit_id: "original-sha",
      path: "src/page.tsx",
      updated_at: "2026-05-20T00:00:00.000Z",
      user: { id: 2, login: "octocat", type: "User" },
    },
    ...overrides,
  };
}

describe("extractGitHubPullRequestReferences", () => {
  it("extracts GitHub pull request URLs from Slack-formatted text", () => {
    expect(
      extractGitHubPullRequestReferences(
        "Please check <https://github.com/acme/web/pull/42|acme/web#42>.",
      ),
    ).toEqual([
      {
        repositoryFullName: "acme/web",
        pullRequestNumber: 42,
        sourceUrl: "https://github.com/acme/web/pull/42",
      },
    ]);
  });
});

describe("extractGitHubRepositoryFullNameReferences", () => {
  it("extracts GitHub repository URLs and owner/repository mentions", () => {
    expect(
      extractGitHubRepositoryFullNameReferences(
        "Run checks for <https://github.com/acme/web|acme/web> and acme/api.",
      ),
    ).toEqual(["acme/web", "acme/api"]);
  });
});

describe("resolveSlackRepositoryGitHubContext", () => {
  it("resolves Slack context from a GitHub pull request URL", async () => {
    const dependencies = createDependencies();

    const resolution = await resolveSlackRepositoryGitHubContext({
      organizationId: "org_123",
      text: "Run the repo agent for https://github.com/acme/web/pull/42 please",
      requirePullRequest: true,
      dependencies,
    });

    expect(resolution).toMatchObject({
      status: "resolved",
      source: "slack_pr_url",
      context: {
        resolved: true,
        installationId: 12345,
        repositoryFullName: "acme/web",
        pullRequestNumber: 42,
        branch: "feature/i18n",
        commitSha: "abc123",
      },
    });
    expect(dependencies.findEnabledRepository).toHaveBeenCalledWith({
      organizationId: "org_123",
      repositoryFullName: "acme/web",
    });
  });

  it("resolves Slack context from project-level repository fallback", async () => {
    const resolution = await resolveSlackRepositoryGitHubContext({
      organizationId: "org_123",
      projectId: "project_123",
      text: "Run the checks for PR #84",
      connectorConfig: {
        repository: {
          github: {
            projectRepositories: {
              project_123: "acme/web",
            },
          },
        },
      },
      requirePullRequest: true,
      dependencies: createDependencies(),
    });

    expect(resolution).toMatchObject({
      status: "resolved",
      source: "project_config",
      context: {
        resolved: true,
        repositoryFullName: "acme/web",
        pullRequestNumber: 84,
      },
    });
  });

  it("resolves Slack context from an installed repository name in the message", async () => {
    const dependencies = createDependencies({
      listEnabledRepositories: vi.fn(async () => [
        {
          installationId: 12345,
          repositoryFullName: "acme/web",
          defaultBranch: "main",
        },
        {
          installationId: 67890,
          repositoryFullName: "acme/api",
          defaultBranch: "main",
        },
      ]),
    });

    const resolution = await resolveSlackRepositoryGitHubContext({
      organizationId: "org_123",
      text: "Run the checks for web PR #84",
      requirePullRequest: true,
      dependencies,
    });

    expect(resolution).toMatchObject({
      status: "resolved",
      source: "slack_repo_reference",
      context: {
        resolved: true,
        installationId: 12345,
        repositoryFullName: "acme/web",
        pullRequestNumber: 84,
      },
    });
  });

  it("resolves Slack context from the only installed repository when no name is provided", async () => {
    const resolution = await resolveSlackRepositoryGitHubContext({
      organizationId: "org_123",
      text: "Run the checks for PR #84",
      requirePullRequest: true,
      dependencies: createDependencies({
        listEnabledRepositories: vi.fn(async () => [
          {
            installationId: 12345,
            repositoryFullName: "acme/web",
            defaultBranch: "main",
          },
        ]),
      }),
    });

    expect(resolution).toMatchObject({
      status: "resolved",
      source: "single_installed_repository",
      context: {
        resolved: true,
        repositoryFullName: "acme/web",
        pullRequestNumber: 84,
      },
    });
  });

  it("asks for owner/repository when a repository name matches multiple installed repos", async () => {
    const resolution = await resolveSlackRepositoryGitHubContext({
      organizationId: "org_123",
      text: "Run checks for web PR #84",
      requirePullRequest: true,
      dependencies: createDependencies({
        listEnabledRepositories: vi.fn(async () => [
          {
            installationId: 12345,
            repositoryFullName: "acme/web",
            defaultBranch: "main",
          },
          {
            installationId: 67890,
            repositoryFullName: "other/web",
            defaultBranch: "main",
          },
        ]),
      }),
    });

    expect(resolution).toMatchObject({
      status: "unresolved",
      context: {
        resolved: false,
        reason: "The Slack request matched multiple installed GitHub repositories.",
      },
      followUp: expect.stringContaining("owner/repository"),
    });
  });

  it("returns a Slack follow-up when repository access validation fails", async () => {
    const resolution = await resolveSlackRepositoryGitHubContext({
      organizationId: "org_123",
      text: "https://github.com/acme/private/pull/12",
      dependencies: createDependencies({
        findEnabledRepository: vi.fn(async () => null),
      }),
    });

    expect(resolution).toMatchObject({
      status: "unresolved",
      context: {
        resolved: false,
        reason: "The GitHub repository is not enabled for this workspace.",
      },
      followUp: expect.stringContaining("enabled for this workspace"),
    });
  });

  it("lists enabled repositories once when resolving an explicit owner/repo reference", async () => {
    const listEnabledRepositories = vi.fn(async () => [
      {
        installationId: 12345,
        repositoryFullName: "org/enabled-repo",
        defaultBranch: "main",
      },
    ]);

    await resolveSlackRepositoryGitHubContext({
      organizationId: "org_123",
      text: "Find the text 'Email agent' in org/disabled-repo",
      requirePullRequest: false,
      dependencies: createDependencies({
        findEnabledRepository: vi.fn(async () => null),
        listEnabledRepositories,
      }),
    });

    expect(listEnabledRepositories).toHaveBeenCalledTimes(1);
  });

  it("does not substitute a different enabled repository when an explicit owner/repo is unavailable", async () => {
    const resolution = await resolveSlackRepositoryGitHubContext({
      organizationId: "org_123",
      text: "Find the text 'Email agent' in org/disabled-repo",
      requirePullRequest: false,
      dependencies: createDependencies({
        findEnabledRepository: vi.fn(async () => null),
        listEnabledRepositories: vi.fn(async () => [
          {
            installationId: 12345,
            repositoryFullName: "org/enabled-repo",
            defaultBranch: "main",
          },
        ]),
      }),
    });

    expect(resolution).toMatchObject({
      status: "unresolved",
      context: {
        resolved: false,
        reason: "The GitHub repository is not enabled for this workspace.",
      },
      followUp: expect.stringContaining("org/disabled-repo"),
    });
    expect(resolution).toMatchObject({
      followUp: expect.stringContaining("enabled for this workspace"),
    });
  });

  it("falls back to the only enabled repository when an explicit owner/repo is not enabled", async () => {
    const resolution = await resolveSlackRepositoryGitHubContext({
      organizationId: "org_123",
      text: "Find the text 'Email agent' in hyperlocalise/hyperlocalise",
      requirePullRequest: false,
      dependencies: createDependencies({
        findEnabledRepository: vi.fn(async () => null),
        listEnabledRepositories: vi.fn(async () => [
          {
            installationId: 12345,
            repositoryFullName: "hyperlocalise/hyperlocalise",
            defaultBranch: "main",
          },
        ]),
      }),
    });

    expect(resolution).toMatchObject({
      status: "resolved",
      source: "single_installed_repository",
      context: {
        resolved: true,
        repositoryFullName: "hyperlocalise/hyperlocalise",
      },
    });
  });

  it("asks for repo or PR context when required context is missing", async () => {
    const resolution = await resolveSlackRepositoryGitHubContext({
      organizationId: "org_123",
      text: "Run the repo checks",
      requirePullRequest: true,
      dependencies: createDependencies(),
    });

    expect(resolution).toMatchObject({
      status: "unresolved",
      followUp: expect.stringContaining("Please send a GitHub pull request URL"),
    });
  });

  it("asks for repo context when a Slack repo intent has no repository fallback", async () => {
    const resolution = await resolveSlackRepositoryGitHubContext({
      organizationId: "org_123",
      text: "Run the repo checks",
      requirePullRequest: false,
      dependencies: createDependencies(),
    });

    expect(resolution).toMatchObject({
      status: "unresolved",
      followUp: expect.stringContaining("include the repository name"),
    });
  });

  it("asks for repo context when multiple repositories are enabled without a fallback", async () => {
    const resolution = await resolveSlackRepositoryGitHubContext({
      organizationId: "org_123",
      text: 'What is the context of "Email agent"?',
      requirePullRequest: false,
      dependencies: createDependencies({
        listEnabledRepositories: vi.fn(async () => [
          {
            installationId: 12345,
            repositoryFullName: "acme/web",
            defaultBranch: "main",
          },
          {
            installationId: 67890,
            repositoryFullName: "acme/api",
            defaultBranch: "main",
          },
        ]),
      }),
    });

    expect(resolution).toMatchObject({
      status: "unresolved",
      followUp: expect.stringContaining("include the repository name"),
    });
  });
});

describe("resolveGitHubRepositoryGitHubContext", () => {
  it("preserves GitHub trigger repository, pull request, installation, branch, and comment scope", async () => {
    const resolution = await resolveGitHubRepositoryGitHubContext({
      raw: createGitHubRawMessage(),
      installationId: 54321,
      dependencies: {
        loadPullRequest: vi.fn(async () => ({
          branch: "fix/login-copy",
          commitSha: "head-sha",
        })),
      },
    });

    expect(resolution).toMatchObject({
      status: "resolved",
      source: "github_trigger",
      context: {
        resolved: true,
        installationId: 54321,
        repositoryFullName: "acme/web",
        pullRequestNumber: 42,
        branch: "fix/login-copy",
        commitSha: "comment-sha",
        commentId: 555,
      },
    });
  });

  it("returns a GitHub follow-up when PR access validation fails", async () => {
    const resolution = await resolveGitHubRepositoryGitHubContext({
      raw: createGitHubRawMessage(),
      installationId: 54321,
      dependencies: {
        loadPullRequest: vi.fn(async () => null),
      },
    });

    expect(resolution).toMatchObject({
      status: "unresolved",
      context: {
        resolved: false,
        reason: "The GitHub App installation could not access the pull request.",
      },
      followUp: expect.stringContaining("I can't access this pull request"),
    });
  });
});

describe("defaultRepositoryGitHubContextDependencies.loadPullRequest", () => {
  it("returns null when GitHub returns unauthorized for pull request access", async () => {
    const unauthorizedError = Object.assign(new Error("Bad credentials"), { status: 401 });
    const pullsGet = vi.fn(async () => {
      throw unauthorizedError;
    });
    getInstallationOctokitMock.mockResolvedValueOnce({
      rest: {
        pulls: {
          get: pullsGet,
        },
      },
    });

    await expect(
      defaultRepositoryGitHubContextDependencies.loadPullRequest({
        installationId: 54321,
        repositoryFullName: "acme/web",
        pullRequestNumber: 42,
      }),
    ).resolves.toBeNull();

    expect(pullsGet).toHaveBeenCalledWith({
      owner: "acme",
      repo: "web",
      pull_number: 42,
    });
  });
});

describe("buildRepositoryGitHubContextInstructions", () => {
  it("formats resolved context for agent instructions", () => {
    expect(
      buildRepositoryGitHubContextInstructions({
        resolved: true,
        installationId: 123,
        repositoryFullName: "acme/web",
        pullRequestNumber: 42,
      }),
    ).toContain("- repository: acme/web");
  });
});
