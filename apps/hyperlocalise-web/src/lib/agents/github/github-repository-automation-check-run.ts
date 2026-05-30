import { getInstallationOctokit } from "@/lib/agents/github/app";
import { env } from "@/lib/env";

const CHECK_RUN_NAME = "Hyperlocalise localization validation";

function parseRepositoryFullName(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) {
    throw new Error("invalid repository full name");
  }
  return { owner, repo };
}

function buildDetailsUrl(jobId: string): string | undefined {
  const base = env.HYPERLOCALISE_PUBLIC_APP_URL;
  if (!base) {
    return undefined;
  }
  return `${base.replace(/\/$/, "")}/api/cron/github-repository-automation?jobId=${encodeURIComponent(jobId)}`;
}

export async function createGithubRepositoryAutomationCheckRun(input: {
  installationId: string;
  repositoryFullName: string;
  headSha: string;
  jobId: string;
}): Promise<string | null> {
  const octokit = await getInstallationOctokit(input.installationId);
  const { owner, repo } = parseRepositoryFullName(input.repositoryFullName);

  const response = await octokit.rest.checks.create({
    owner,
    repo,
    name: CHECK_RUN_NAME,
    head_sha: input.headSha,
    status: "in_progress",
    details_url: buildDetailsUrl(input.jobId),
    output: {
      title: "Validating localization commits",
      summary: "Running per-commit hl check and repository localization review.",
    },
  });

  return String(response.data.id);
}

export async function completeGithubRepositoryAutomationCheckRun(input: {
  installationId: string;
  repositoryFullName: string;
  checkRunId: string;
  conclusion: "success" | "failure" | "neutral";
  summary: string;
  jobId: string;
}): Promise<void> {
  const octokit = await getInstallationOctokit(input.installationId);
  const { owner, repo } = parseRepositoryFullName(input.repositoryFullName);

  await octokit.rest.checks.update({
    owner,
    repo,
    check_run_id: Number(input.checkRunId),
    status: "completed",
    conclusion: input.conclusion,
    details_url: buildDetailsUrl(input.jobId),
    output: {
      title: CHECK_RUN_NAME,
      summary: input.summary,
    },
  });
}
