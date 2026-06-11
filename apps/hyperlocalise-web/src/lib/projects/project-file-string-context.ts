import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import {
  buildRepositoryGitHubContextInstructions,
  resolveWebProjectRepositoryGitHubContext,
} from "@/lib/agents/repository-context";
import { runSubagent } from "@/lib/agent-runtime/subagents/run-subagent";
import { createRepositorySandbox } from "@/lib/agent-runtime/workspaces/repository-sandbox";
import { stopRepositorySandbox } from "@/lib/agent-runtime/workspaces/repository-sandbox";
import { ensureAgentSession } from "@/lib/tools/types";
import type { ToolContext } from "@/lib/tools/types";
import { db, schema } from "@/lib/database";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

export type ProjectFileStringContextError =
  | { code: "repository_not_enabled"; message: string }
  | { code: "repository_context_ambiguous"; message: string }
  | { code: "repository_access_failed"; message: string }
  | { code: "agent_failed"; message: string };

async function resolveRepositoryFullName(input: {
  organizationId: string;
  repositoryFullName: string | null;
}): Promise<Result<string, ProjectFileStringContextError>> {
  if (input.repositoryFullName) {
    return ok(input.repositoryFullName);
  }

  const repositories = await db
    .select({ fullName: schema.githubInstallationRepositories.fullName })
    .from(schema.githubInstallationRepositories)
    .where(
      and(
        eq(schema.githubInstallationRepositories.organizationId, input.organizationId),
        eq(schema.githubInstallationRepositories.enabled, true),
        eq(schema.githubInstallationRepositories.archived, false),
      ),
    )
    .limit(2);

  if (repositories.length === 0) {
    return err({
      code: "repository_not_enabled",
      message: "Enable one GitHub repository in Agent → GitHub before looking up string context.",
    });
  }

  if (repositories.length > 1) {
    return err({
      code: "repository_context_ambiguous",
      message:
        "More than one GitHub repository is enabled. Disable the extra repositories or specify the repository before looking up string context.",
    });
  }

  return ok(repositories[0].fullName);
}

export async function lookupProjectFileStringRepositoryContext(input: {
  organizationId: string;
  projectId: string;
  repositoryFullName: string | null;
  sourcePath: string;
  key: string;
  text: string;
  context: string | null;
  localUserId: string;
  membershipRole: OrganizationMembershipRole;
  displayName: string | null;
  email: string | null;
}): Promise<Result<{ summary: string }, ProjectFileStringContextError>> {
  const repositoryResult = await resolveRepositoryFullName({
    organizationId: input.organizationId,
    repositoryFullName: input.repositoryFullName,
  });
  if (isErr(repositoryResult)) {
    return repositoryResult;
  }

  const resolution = await resolveWebProjectRepositoryGitHubContext({
    organizationId: input.organizationId,
    repositoryFullName: repositoryResult.value,
  });

  if (resolution.status === "unresolved") {
    return err({
      code: "repository_not_enabled",
      message: resolution.followUp,
    });
  }

  if (resolution.status !== "resolved" || !resolution.context.resolved) {
    return err({
      code: "repository_not_enabled",
      message:
        "Connect and enable a GitHub repository in Agent → GitHub before looking up string context.",
    });
  }

  const githubContext = resolution.context;
  let sandboxId: string | null = null;

  try {
    sandboxId = await createRepositorySandbox(githubContext);
  } catch {
    return err({
      code: "repository_access_failed",
      message:
        "The GitHub App could not access this repository. Check that it is installed and enabled for this workspace.",
    });
  }

  const conversationId = `project-file-context:${randomUUID()}`;
  const toolContext: ToolContext = {
    conversationId,
    agentSession: { todos: [] },
    organizationId: input.organizationId,
    localUserId: input.localUserId,
    membershipRole: input.membershipRole,
    projectId: input.projectId,
    db,
    workMode: "read_only",
    repositorySource: "chat_ui",
    actor: {
      sourceUserId: input.localUserId,
      userId: input.localUserId,
      email: input.email ?? undefined,
      displayName: input.displayName ?? undefined,
      role: input.membershipRole,
    },
    sandboxId,
    githubContext,
  };

  ensureAgentSession(toolContext);

  const instructions = [
    buildRepositoryGitHubContextInstructions(githubContext),
    `Source file path in the TMS project: ${input.sourcePath}`,
    `String key: ${input.key}`,
    `Source text: ${input.text}`,
    input.context ? `Crowdin/context note: ${input.context}` : null,
    "Find where this string appears in the connected repository and explain localization-relevant context for translators.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n\n");

  try {
    const result = await runSubagent("repository", {
      toolContext,
      task: `Find repository context for localization key "${input.key}".`,
      instructions,
    });

    const summary = result.text.trim();
    if (!summary) {
      return err({
        code: "agent_failed",
        message: "The repository agent did not return any context for this string.",
      });
    }

    return ok({ summary });
  } catch {
    return err({
      code: "agent_failed",
      message: "Failed to look up repository context. Try again in a moment.",
    });
  } finally {
    if (sandboxId) {
      await stopRepositorySandbox(sandboxId).catch(() => undefined);
    }
  }
}
