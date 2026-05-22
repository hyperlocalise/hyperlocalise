import type {
  RepoTmsAgentActor,
  RepoTmsAgentTaskSource,
  RepoTmsAgentWorkMode,
} from "./repo-tms-task";

export type WriteAction =
  | "upload_sources"
  | "apply_fixes"
  | "commit_changes"
  | "push_to_branch"
  | "tms_mutate";

export type WriteGateResult = { allowed: true } | { allowed: false; reason: string };

const adminRoles = new Set(["owner", "admin"]);

/**
 * Determine whether a repo/TMS write action is allowed for the current task.
 *
 * Rules:
 * - read_only: all writes are denied.
 * - slack: repo/TMS workflows are read-only from Slack, so writes are denied
 *   even if a malformed or legacy task carries a write-capable mode.
 * - write: allow GitHub requests that passed adapter-level permission checks.
 * - approval_required: keep GitHub admin-gated.
 *
 * GitHub-sourced write-mode tasks are assumed to have passed bot-level
 * permission checks (requesterCanRunFix) before enqueuing.
 */
export function checkRepoTmsWriteGate(input: {
  workMode: RepoTmsAgentWorkMode;
  source: RepoTmsAgentTaskSource;
  actor: RepoTmsAgentActor;
  action: WriteAction;
}): WriteGateResult {
  if (input.workMode === "read_only") {
    return {
      allowed: false,
      reason: "This workflow is running in read-only mode. Write actions are not permitted.",
    };
  }

  if (input.source === "slack") {
    return checkSlackWriteGate(input.workMode, input.actor);
  }

  if (input.source === "github") {
    return checkGitHubWriteGate(input.workMode, input.actor);
  }

  // chat_ui: same as Slack — require a verified workspace member role.
  return checkSlackWriteGate(input.workMode, input.actor);
}

function checkSlackWriteGate(
  _workMode: RepoTmsAgentWorkMode,
  _actor: RepoTmsAgentActor,
): WriteGateResult {
  return {
    allowed: false,
    reason: "Slack-triggered repo/TMS workflows are read-only. Write actions are not permitted.",
  };
}

function checkGitHubWriteGate(
  workMode: RepoTmsAgentWorkMode,
  actor: RepoTmsAgentActor,
): WriteGateResult {
  const isAdmin = actor.role && adminRoles.has(actor.role);

  if (workMode === "write") {
    // GitHub write mode is allowed if the requester passed the bot permission
    // check. We additionally auto-approve for Hyperlocalise admins.
    return { allowed: true };
  }

  // approval_required: allow admins; deny other roles until a durable approval
  // flow exists.
  if (isAdmin) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason:
      "Write actions in this workflow require admin or owner privileges. Please contact a workspace admin.",
  };
}

/**
 * Check whether the GitHub App installation can push to the PR branch.
 */
export async function canPushToGitHubBranch(input: {
  installationId: number;
  repositoryFullName: string;
  branch: string;
}): Promise<{ canPush: boolean; reason?: string }> {
  const { getInstallationOctokit } = await import("@/lib/agents/github/app");

  try {
    const octokit = await getInstallationOctokit(input.installationId);
    const [owner, repo] = input.repositoryFullName.split("/");
    if (!owner || !repo) {
      return { canPush: false, reason: "Invalid repository full name." };
    }

    const { data: repository } = await octokit.rest.repos.get({
      owner,
      repo,
    });

    const hasPushAccess = repository.permissions?.push === true;
    if (!hasPushAccess) {
      return {
        canPush: false,
        reason: "The GitHub App installation does not have push access to this repository.",
      };
    }

    const { data: branch } = await octokit.rest.repos.getBranch({
      owner,
      repo,
      branch: input.branch,
    });

    if (branch.protected) {
      return {
        canPush: false,
        reason: `Branch ${input.branch} is protected. Push changes through the repository's required review flow.`,
      };
    }

    return { canPush: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      canPush: false,
      reason: `Could not verify push permission: ${message}`,
    };
  }
}
