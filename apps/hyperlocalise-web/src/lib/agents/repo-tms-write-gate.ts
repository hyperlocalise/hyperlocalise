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
 * - write: allow if the actor is an admin/owner; deny for members.
 * - approval_required: auto-approve for admin/owner; otherwise require explicit approval.
 *
 * GitHub-sourced tasks are assumed to have passed bot-level permission checks
 * (requesterCanRunFix) before enqueuing, so they are treated more permissively
 * than Slack for write/approval_required modes.
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

  // chat_ui: same as Slack — require admin/owner or explicit approval
  return checkSlackWriteGate(input.workMode, input.actor);
}

function checkSlackWriteGate(
  workMode: RepoTmsAgentWorkMode,
  actor: RepoTmsAgentActor,
): WriteGateResult {
  const isAdmin = actor.role && adminRoles.has(actor.role);

  if (workMode === "write") {
    if (isAdmin) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason:
        "Slack-triggered write actions require admin or owner privileges. Please contact a workspace admin.",
    };
  }

  // approval_required
  if (isAdmin) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason:
      "This write action requires explicit approval. A workspace admin or owner must approve it first.",
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

  // approval_required: auto-approve for admins; otherwise allow because
  // the GitHub bot already verified write access before enqueuing.
  if (isAdmin) {
    return { allowed: true };
  }

  return { allowed: true };
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

    const { data: pr } = await octokit.rest.repos.get({
      owner,
      repo,
    });

    const hasPushAccess = pr.permissions?.push === true;
    if (!hasPushAccess) {
      return {
        canPush: false,
        reason: "The GitHub App installation does not have push access to this repository.",
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
