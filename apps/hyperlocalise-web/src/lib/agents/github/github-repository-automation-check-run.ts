import { getInstallationOctokit } from "@/lib/agents/github/app";
import { env } from "@/lib/env";

// Stable GitHub check context for branch protection rules.
const CHECK_RUN_NAME = "Hyperlocalise localization validation";

export type GithubRepositoryAutomationCheckConclusion =
  | "success"
  | "failure"
  | "neutral"
  | "skipped";

export function resolveGithubAutomationCheckConclusion(input: {
  statusCheckMode: "advisory" | "blocking";
  status: "succeeded" | "failed" | "skipped";
}): GithubRepositoryAutomationCheckConclusion {
  if (input.status === "succeeded") {
    return "success";
  }

  if (input.status === "skipped") {
    return "skipped";
  }

  return input.statusCheckMode === "advisory" ? "neutral" : "failure";
}

function parseRepositoryFullName(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) {
    throw new Error("invalid repository full name");
  }
  return { owner, repo };
}

export function buildGithubRepositoryAutomationJobDetailsUrl(input: {
  organizationSlug: string | null;
  githubRepositoryId: string;
  jobId: string;
}): string | undefined {
  const base = env.HYPERLOCALISE_PUBLIC_APP_URL;
  if (!base || !input.organizationSlug) {
    return undefined;
  }

  const params = new URLSearchParams({
    githubRepositoryId: input.githubRepositoryId,
    automationJobId: input.jobId,
  });

  return `${base.replace(/\/$/, "")}/org/${encodeURIComponent(input.organizationSlug)}/integrations?${params.toString()}`;
}

export async function createGithubRepositoryAutomationCheckRun(input: {
  installationId: string;
  repositoryFullName: string;
  headSha: string;
  jobId: string;
  organizationSlug: string | null;
  githubRepositoryId: string;
  summary?: string;
}): Promise<string | null> {
  const octokit = await getInstallationOctokit(input.installationId);
  const { owner, repo } = parseRepositoryFullName(input.repositoryFullName);

  const response = await octokit.rest.checks.create({
    owner,
    repo,
    name: CHECK_RUN_NAME,
    head_sha: input.headSha,
    status: "in_progress",
    external_id: input.jobId,
    details_url: buildGithubRepositoryAutomationJobDetailsUrl({
      organizationSlug: input.organizationSlug,
      githubRepositoryId: input.githubRepositoryId,
      jobId: input.jobId,
    }),
    output: {
      title: CHECK_RUN_NAME,
      summary:
        input.summary ??
        "Running Hyperlocalise repository automation for source upload, translation pull, and localization validation.",
    },
  });

  return String(response.data.id);
}

export async function completeGithubRepositoryAutomationCheckRun(input: {
  installationId: string;
  repositoryFullName: string;
  checkRunId: string;
  conclusion: GithubRepositoryAutomationCheckConclusion;
  summary: string;
  jobId: string;
  organizationSlug: string | null;
  githubRepositoryId: string;
}): Promise<void> {
  const octokit = await getInstallationOctokit(input.installationId);
  const { owner, repo } = parseRepositoryFullName(input.repositoryFullName);

  await octokit.rest.checks.update({
    owner,
    repo,
    check_run_id: Number.parseInt(input.checkRunId, 10),
    status: "completed",
    conclusion: input.conclusion,
    details_url: buildGithubRepositoryAutomationJobDetailsUrl({
      organizationSlug: input.organizationSlug,
      githubRepositoryId: input.githubRepositoryId,
      jobId: input.jobId,
    }),
    output: {
      title: CHECK_RUN_NAME,
      summary: input.summary,
    },
  });
}
