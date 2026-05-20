import type { GitHubRawMessage } from "@chat-adapter/github";
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import { getInstallationOctokit } from "./github/app";
import type {
  RepoTmsAgentGitHubContext,
  UnresolvedRepoTmsAgentGitHubContext,
} from "./repo-tms-task";

export type GitHubPullRequestReference = {
  repositoryFullName: string;
  pullRequestNumber: number;
  sourceUrl: string;
};

type EnabledGitHubRepository = {
  installationId: number;
  repositoryFullName: string;
  defaultBranch: string | null;
};

type PullRequestDetails = {
  branch: string | null;
  commitSha: string | null;
};

type ResolvedContextSource =
  | "slack_pr_url"
  | "slack_repo_reference"
  | "project_config"
  | "channel_config"
  | "workspace_config"
  | "single_installed_repository"
  | "github_trigger";

export type RepoTmsGitHubContextResolution =
  | { status: "not_applicable" }
  | {
      status: "resolved";
      source: ResolvedContextSource;
      context: RepoTmsAgentGitHubContext;
    }
  | {
      status: "unresolved";
      context: UnresolvedRepoTmsAgentGitHubContext;
      followUp: string;
    };

export type RepoTmsGitHubContextDependencies = {
  findEnabledRepository: (input: {
    organizationId: string;
    repositoryFullName: string;
  }) => Promise<EnabledGitHubRepository | null>;
  listEnabledRepositories: (input: {
    organizationId: string;
  }) => Promise<EnabledGitHubRepository[]>;
  loadPullRequest: (input: {
    installationId: number;
    repositoryFullName: string;
    pullRequestNumber: number;
  }) => Promise<PullRequestDetails | null>;
};

export const githubPullRequestUrlPatternSource = String.raw`https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)(?=[/?#\s>|)\].,;:!?]|$)`;

const githubPullRequestUrlPattern = new RegExp(githubPullRequestUrlPatternSource, "gi");
const githubRepositoryUrlPattern =
  /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)(?=[/?#\s>|)\].,;:!?]|$)/gi;
const githubRepositoryFullNamePattern =
  /(?:^|[\s(<])([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+)(?=[\s>|)\].,;:!?]|$)/gi;

export function extractGitHubPullRequestReferences(text: string): GitHubPullRequestReference[] {
  const references = new Map<string, GitHubPullRequestReference>();

  for (const match of text.matchAll(githubPullRequestUrlPattern)) {
    const owner = match[1];
    const repo = match[2];
    const pullRequestNumber = Number.parseInt(match[3] ?? "", 10);
    if (!owner || !repo || !Number.isSafeInteger(pullRequestNumber)) {
      continue;
    }

    const repositoryFullName = `${owner}/${repo}`;
    references.set(`${repositoryFullName.toLowerCase()}#${pullRequestNumber}`, {
      repositoryFullName,
      pullRequestNumber,
      sourceUrl: match[0],
    });
  }

  return [...references.values()];
}

export function extractGitHubPullRequestNumber(text: string): "ambiguous" | number | null {
  const numbers = new Set<number>();

  for (const pattern of [/\b(?:pr|pull request)\s*#?(\d+)\b/gi, /\bgithub\s+#?(\d+)\b/gi]) {
    for (const match of text.matchAll(pattern)) {
      const pullRequestNumber = Number.parseInt(match[1] ?? "", 10);
      if (Number.isSafeInteger(pullRequestNumber)) {
        numbers.add(pullRequestNumber);
      }
    }
  }

  if (numbers.size > 1) {
    return "ambiguous";
  }

  return numbers.values().next().value ?? null;
}

export function extractGitHubRepositoryFullNameReferences(text: string): string[] {
  const references = new Map<string, string>();

  for (const match of text.matchAll(githubRepositoryUrlPattern)) {
    const owner = match[1];
    const repo = match[2];
    if (!owner || !repo) {
      continue;
    }

    const repositoryFullName = normalizeRepositoryFullName(
      trimTrailingRepositoryReferencePunctuation(`${owner}/${repo}`),
    );
    if (repositoryFullName) {
      references.set(repositoryFullName.toLowerCase(), repositoryFullName);
    }
  }

  for (const match of text.matchAll(githubRepositoryFullNamePattern)) {
    const repositoryFullName = normalizeRepositoryFullName(
      trimTrailingRepositoryReferencePunctuation(match[1] ?? ""),
    );
    if (repositoryFullName) {
      references.set(repositoryFullName.toLowerCase(), repositoryFullName);
    }
  }

  return [...references.values()];
}

export async function resolveSlackRepoTmsGitHubContext(input: {
  organizationId: string;
  text: string;
  connectorConfig?: Record<string, unknown> | null;
  projectId?: string | null;
  channelId?: string | null;
  requirePullRequest?: boolean;
  dependencies?: RepoTmsGitHubContextDependencies;
}): Promise<RepoTmsGitHubContextResolution> {
  const dependencies = input.dependencies ?? defaultRepoTmsGitHubContextDependencies;
  const references = extractGitHubPullRequestReferences(input.text);

  if (references.length > 1) {
    return unresolved(
      "Multiple GitHub pull request links were provided.",
      "Please send one GitHub pull request URL.",
      "I found more than one GitHub pull request link. Please send one PR URL so I know which repository and pull request to use.",
    );
  }

  if (references.length === 1) {
    const reference = references[0];
    return resolveInstalledGitHubContext({
      organizationId: input.organizationId,
      repositoryFullName: reference.repositoryFullName,
      pullRequestNumber: reference.pullRequestNumber,
      source: "slack_pr_url",
      accessFailureFollowUp: `I found ${reference.sourceUrl}, but I can't access that pull request with the GitHub App installation. Please check the app is installed and the repository is enabled for this workspace.`,
      dependencies,
    });
  }

  const installedRepositories = await dependencies.listEnabledRepositories({
    organizationId: input.organizationId,
  });
  const referencedRepository = resolveSlackReferencedRepository({
    text: input.text,
    installedRepositories,
  });
  if (referencedRepository.status === "unresolved") {
    return referencedRepository.resolution;
  }

  const configuredRepository = getConfiguredRepository({
    config: input.connectorConfig,
    projectId: input.projectId,
    channelId: input.channelId,
  });
  const fallback =
    referencedRepository.status === "resolved"
      ? referencedRepository.repository
      : (configuredRepository ?? getSingleInstalledRepository(installedRepositories));
  if (!fallback) {
    return unresolved(
      "No GitHub repository context was configured for this Slack request.",
      "Provide a GitHub pull request URL, repo name, or configure a project/channel repository fallback.",
      "Please send a GitHub pull request URL, include the repository name, or configure a default repository for this project or Slack channel.",
    );
  }

  const pullRequestNumber = extractGitHubPullRequestNumber(input.text);
  if (pullRequestNumber === "ambiguous") {
    return unresolved(
      "Multiple pull request numbers were provided.",
      "Please include one PR number.",
      "I found more than one pull request number. Please send one PR number so I know which pull request to use.",
    );
  }

  if (input.requirePullRequest && pullRequestNumber === null) {
    return unresolved(
      "A GitHub repository fallback was configured, but no pull request number was provided.",
      "Include a PR number or send a GitHub pull request URL.",
      `I know the repository is ${fallback.repositoryFullName}, but I still need the pull request number. Please include a PR number or send the PR URL.`,
    );
  }

  if (fallback.enabledRepository) {
    return resolveEnabledGitHubRepositoryContext({
      repository: fallback.enabledRepository,
      pullRequestNumber: pullRequestNumber ?? undefined,
      source: fallback.source,
      accessFailureFollowUp: `I found repository context for ${fallback.repositoryFullName}, but I can't access it with the GitHub App installation. Please check the app is installed and the repository is enabled for this workspace.`,
      dependencies,
    });
  }

  return resolveInstalledGitHubContext({
    organizationId: input.organizationId,
    repositoryFullName: fallback.repositoryFullName,
    pullRequestNumber: pullRequestNumber ?? undefined,
    source: fallback.source,
    accessFailureFollowUp: `I found repository context for ${fallback.repositoryFullName}, but I can't access it with the GitHub App installation. Please check the app is installed and the repository is enabled for this workspace.`,
    dependencies,
  });
}

export async function resolveGitHubRepoTmsGitHubContext(input: {
  raw: GitHubRawMessage;
  installationId: number;
  dependencies?: Pick<RepoTmsGitHubContextDependencies, "loadPullRequest">;
}): Promise<RepoTmsGitHubContextResolution> {
  if (input.raw.type === "issue_comment" && input.raw.threadType === "issue") {
    return unresolved(
      "The GitHub request was made from an issue instead of a pull request.",
      "Run the command from a pull request comment or inline pull request review comment.",
      "I need a pull request context for this GitHub request. Please run the command from a PR comment or an inline PR review comment.",
    );
  }

  const repositoryFullName = normalizeRepositoryFullName(input.raw.repository.full_name);
  if (!repositoryFullName) {
    return unresolved(
      "The GitHub request did not include a valid repository name.",
      "Try again from a pull request where the repository is visible to the GitHub App.",
      "I couldn't determine the GitHub repository for this request. Please try again from the target pull request.",
    );
  }

  const loadPullRequest =
    input.dependencies?.loadPullRequest ?? defaultRepoTmsGitHubContextDependencies.loadPullRequest;
  const details = await loadPullRequest({
    installationId: input.installationId,
    repositoryFullName,
    pullRequestNumber: input.raw.prNumber,
  });

  if (!details) {
    return unresolved(
      "The GitHub App installation could not access the pull request.",
      "Check that the app is installed and enabled for this repository.",
      "I can't access this pull request with the GitHub App installation. Please check that the app is installed and enabled for this repository.",
    );
  }

  return {
    status: "resolved",
    source: "github_trigger",
    context: {
      resolved: true,
      installationId: input.installationId,
      repositoryFullName,
      pullRequestNumber: input.raw.prNumber,
      branch: details.branch ?? undefined,
      commitSha: getGitHubRawCommitSha(input.raw) ?? details.commitSha ?? undefined,
      commentId: input.raw.comment.id,
    },
  };
}

export function buildRepoTmsGitHubContextInstructions(context: RepoTmsAgentGitHubContext): string {
  return [
    "Resolved GitHub repository context:",
    `- installationId: ${context.installationId}`,
    `- repository: ${context.repositoryFullName}`,
    context.pullRequestNumber === undefined
      ? null
      : `- pullRequestNumber: ${context.pullRequestNumber}`,
    context.branch ? `- branch: ${context.branch}` : null,
    context.commitSha ? `- commitSha: ${context.commitSha}` : null,
    context.commentId === undefined ? null : `- commentId: ${context.commentId}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

async function resolveInstalledGitHubContext(input: {
  organizationId: string;
  repositoryFullName: string;
  pullRequestNumber?: number;
  source: ResolvedContextSource;
  accessFailureFollowUp: string;
  dependencies: RepoTmsGitHubContextDependencies;
}): Promise<RepoTmsGitHubContextResolution> {
  const repositoryFullName = normalizeRepositoryFullName(input.repositoryFullName);
  if (!repositoryFullName) {
    return unresolved(
      "The GitHub repository context is invalid.",
      "Use an owner/repository value.",
      "I couldn't use the configured GitHub repository. Please provide a repository in owner/name format.",
    );
  }

  const repository = await input.dependencies.findEnabledRepository({
    organizationId: input.organizationId,
    repositoryFullName,
  });
  if (!repository) {
    return unresolved(
      "The GitHub repository is not enabled for this workspace.",
      "Install the GitHub App for the repository and enable it in Hyperlocalise.",
      input.accessFailureFollowUp,
    );
  }

  return resolveEnabledGitHubRepositoryContext({
    repository,
    pullRequestNumber: input.pullRequestNumber,
    source: input.source,
    accessFailureFollowUp: input.accessFailureFollowUp,
    dependencies: input.dependencies,
  });
}

async function resolveEnabledGitHubRepositoryContext(input: {
  repository: EnabledGitHubRepository;
  pullRequestNumber?: number;
  source: ResolvedContextSource;
  accessFailureFollowUp: string;
  dependencies: Pick<RepoTmsGitHubContextDependencies, "loadPullRequest">;
}): Promise<RepoTmsGitHubContextResolution> {
  if (input.pullRequestNumber === undefined) {
    return {
      status: "resolved",
      source: input.source,
      context: {
        resolved: true,
        installationId: input.repository.installationId,
        repositoryFullName: input.repository.repositoryFullName,
        branch: input.repository.defaultBranch ?? undefined,
      },
    };
  }

  const details = await input.dependencies.loadPullRequest({
    installationId: input.repository.installationId,
    repositoryFullName: input.repository.repositoryFullName,
    pullRequestNumber: input.pullRequestNumber,
  });
  if (!details) {
    return unresolved(
      "The GitHub App installation could not access the pull request.",
      "Check that the app is installed, the repository is enabled, and the PR number is correct.",
      input.accessFailureFollowUp,
    );
  }

  return {
    status: "resolved",
    source: input.source,
    context: {
      resolved: true,
      installationId: input.repository.installationId,
      repositoryFullName: input.repository.repositoryFullName,
      pullRequestNumber: input.pullRequestNumber,
      branch: details.branch ?? undefined,
      commitSha: details.commitSha ?? undefined,
    },
  };
}

function getConfiguredRepository(input: {
  config?: Record<string, unknown> | null;
  projectId?: string | null;
  channelId?: string | null;
}): SlackRepositoryFallback | null {
  const root = asRecord(input.config);
  const repoTms = asRecord(root?.repoTms);
  const github = asRecord(repoTms?.github) ?? asRecord(root?.github);
  if (!github) {
    return null;
  }

  if (input.projectId) {
    const repositoryFullName = getRepositoryFromMap(github.projectRepositories, input.projectId);
    if (repositoryFullName) {
      return { repositoryFullName, source: "project_config" };
    }
  }

  if (input.channelId) {
    const repositoryFullName = getRepositoryFromMap(github.channelRepositories, input.channelId);
    if (repositoryFullName) {
      return { repositoryFullName, source: "channel_config" };
    }
  }

  const repositoryFullName = repositoryFullNameFromConfigValue(github.defaultRepositoryFullName);
  return repositoryFullName ? { repositoryFullName, source: "workspace_config" } : null;
}

function getRepositoryFromMap(value: unknown, key: string): string | null {
  const repositories = asRecord(value);
  return repositories ? repositoryFullNameFromConfigValue(repositories[key]) : null;
}

type SlackRepositoryFallback = {
  repositoryFullName: string;
  source: ResolvedContextSource;
  enabledRepository?: EnabledGitHubRepository;
};

type SlackReferencedRepositoryResolution =
  | { status: "not_found" }
  | { status: "resolved"; repository: SlackRepositoryFallback }
  | {
      status: "unresolved";
      resolution: Extract<RepoTmsGitHubContextResolution, { status: "unresolved" }>;
    };

function resolveSlackReferencedRepository(input: {
  text: string;
  installedRepositories: EnabledGitHubRepository[];
}): SlackReferencedRepositoryResolution {
  const fullNameReferences = extractGitHubRepositoryFullNameReferences(input.text);
  if (fullNameReferences.length > 1) {
    return {
      status: "unresolved",
      resolution: unresolved(
        "Multiple GitHub repositories were provided.",
        "Please include one repository name.",
        "I found more than one GitHub repository. Please send one repository or PR URL so I know which repo to use.",
      ),
    };
  }

  if (fullNameReferences.length === 1) {
    return {
      status: "resolved",
      repository: {
        repositoryFullName: fullNameReferences[0]!,
        source: "slack_repo_reference",
      },
    };
  }

  const matches = input.installedRepositories.filter((repository) =>
    slackTextContainsRepositoryName(input.text, repository.repositoryFullName),
  );
  const uniqueMatches = uniqueRepositories(matches);

  if (uniqueMatches.length === 0) {
    return { status: "not_found" };
  }

  if (uniqueMatches.length > 1) {
    return {
      status: "unresolved",
      resolution: unresolved(
        "The Slack request matched multiple installed GitHub repositories.",
        "Please include owner/repository or a pull request URL.",
        "I found multiple installed repositories matching that name. Please include owner/repository or send the PR URL so I know which repo to use.",
      ),
    };
  }

  const repository = uniqueMatches[0]!;
  return {
    status: "resolved",
    repository: {
      repositoryFullName: repository.repositoryFullName,
      source: "slack_repo_reference",
      enabledRepository: repository,
    },
  };
}

function getSingleInstalledRepository(
  installedRepositories: EnabledGitHubRepository[],
): SlackRepositoryFallback | null {
  const repositories = uniqueRepositories(installedRepositories);
  if (repositories.length !== 1) {
    return null;
  }

  const repository = repositories[0]!;
  return {
    repositoryFullName: repository.repositoryFullName,
    source: "single_installed_repository",
    enabledRepository: repository,
  };
}

function uniqueRepositories(repositories: EnabledGitHubRepository[]) {
  const unique = new Map<string, EnabledGitHubRepository>();
  for (const repository of repositories) {
    unique.set(repository.repositoryFullName.toLowerCase(), repository);
  }

  return [...unique.values()];
}

function slackTextContainsRepositoryName(text: string, repositoryFullName: string) {
  const repositoryName = repositoryFullName.split("/")[1];
  if (!repositoryName) {
    return false;
  }

  return new RegExp(
    `(^|[^A-Za-z0-9_.-])${escapeRegExp(repositoryName)}($|[^A-Za-z0-9_.-])`,
    "i",
  ).test(text);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function repositoryFullNameFromConfigValue(value: unknown): string | null {
  if (typeof value === "string") {
    return normalizeRepositoryFullName(value);
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return (
    repositoryFullNameFromConfigValue(record.repositoryFullName) ??
    repositoryFullNameFromConfigValue(record.fullName)
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeRepositoryFullName(value: string): string | null {
  const trimmed = value.trim();
  const parts = trimmed.split("/");
  if (parts.length !== 2) {
    return null;
  }

  const [owner, repo] = parts;
  if (!owner || !repo || /\s/.test(owner) || /\s/.test(repo)) {
    return null;
  }

  return `${owner}/${repo}`;
}

function trimTrailingRepositoryReferencePunctuation(value: string) {
  return value.replace(/[.,;:!?]+$/g, "");
}

function getGitHubRawCommitSha(raw: GitHubRawMessage): string | null {
  return raw.type === "review_comment"
    ? (raw.comment.commit_id ?? raw.comment.original_commit_id ?? null)
    : null;
}

function unresolved(
  reason: string,
  hint: string,
  followUp: string,
): Extract<RepoTmsGitHubContextResolution, { status: "unresolved" }> {
  return {
    status: "unresolved",
    context: {
      resolved: false,
      reason,
      hint,
    },
    followUp,
  };
}

export const defaultRepoTmsGitHubContextDependencies: RepoTmsGitHubContextDependencies = {
  async findEnabledRepository(input) {
    const [repository] = await db
      .select({
        githubInstallationId: schema.githubInstallationRepositories.githubInstallationId,
        fullName: schema.githubInstallationRepositories.fullName,
        defaultBranch: schema.githubInstallationRepositories.defaultBranch,
      })
      .from(schema.githubInstallationRepositories)
      .where(
        and(
          eq(schema.githubInstallationRepositories.organizationId, input.organizationId),
          eq(schema.githubInstallationRepositories.fullName, input.repositoryFullName),
          eq(schema.githubInstallationRepositories.enabled, true),
        ),
      )
      .limit(1);

    if (!repository) {
      return null;
    }

    const installationId = Number.parseInt(repository.githubInstallationId, 10);
    if (!Number.isSafeInteger(installationId)) {
      return null;
    }

    return {
      installationId,
      repositoryFullName: repository.fullName,
      defaultBranch: repository.defaultBranch,
    };
  },
  async listEnabledRepositories(input) {
    const repositories = await db
      .select({
        githubInstallationId: schema.githubInstallationRepositories.githubInstallationId,
        fullName: schema.githubInstallationRepositories.fullName,
        defaultBranch: schema.githubInstallationRepositories.defaultBranch,
      })
      .from(schema.githubInstallationRepositories)
      .where(
        and(
          eq(schema.githubInstallationRepositories.organizationId, input.organizationId),
          eq(schema.githubInstallationRepositories.enabled, true),
        ),
      );

    return repositories
      .map((repository) => {
        const installationId = Number.parseInt(repository.githubInstallationId, 10);
        if (!Number.isSafeInteger(installationId)) {
          return null;
        }

        return {
          installationId,
          repositoryFullName: repository.fullName,
          defaultBranch: repository.defaultBranch,
        };
      })
      .filter((repository): repository is EnabledGitHubRepository => repository !== null);
  },
  async loadPullRequest(input) {
    const [owner, repo] = input.repositoryFullName.split("/");
    if (!owner || !repo) {
      return null;
    }

    try {
      const octokit = await getInstallationOctokit(input.installationId);
      const { data } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: input.pullRequestNumber,
      });

      return {
        branch: data.head.ref ?? null,
        commitSha: data.head.sha ?? null,
      };
    } catch (error) {
      if (isGitHubAccessFailure(error)) {
        return null;
      }

      throw error;
    }
  },
};

function isGitHubAccessFailure(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return false;
  }

  return error.status === 401 || error.status === 403 || error.status === 404;
}
