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
import type { RepositoryAgentGitLabContext } from "@/lib/agent-contracts/gitlab-repository-task";
import {
  createVercelSandboxWorkspace,
  stopWorkspace,
} from "@/lib/agent-runtime/workspaces/vercel-sandbox-runtime";
import { createLogger, serializeErrorForLog } from "@/lib/log";
import { isErr } from "@/lib/primitives/result/results";

import { resolveGitLabAccess } from "./access";
import { buildGitLabCloneUrl } from "./client";
import { GITLAB_GIT_OAUTH_USERNAME } from "./constants";

const logger = createLogger("gitlab-repository-sandbox");

function gitlabRepositorySandboxRevisionKind(
  context: RepositoryAgentGitLabContext,
): "commit" | "branch" | "head" {
  if (context.commitSha) {
    return "commit";
  }
  if (context.branch) {
    return "branch";
  }
  return "head";
}

export async function createGitlabRepositorySandbox(input: {
  localOrganizationId: string;
  workosUserId?: string | null;
  gitlabContext: RepositoryAgentGitLabContext;
  cloneDepth?: number;
  timeoutMs?: number;
}): Promise<string> {
  const log = logger.child({
    projectId: input.gitlabContext.projectId,
    revisionKind: gitlabRepositorySandboxRevisionKind(input.gitlabContext),
  });
  log.info("resolving gitlab access for repository sandbox");

  const access = await resolveGitLabAccess(input);
  if (isErr(access)) {
    log.error({ err: access.error.code }, "gitlab access unavailable for sandbox clone");
    throw new Error(access.error.code);
  }

  const revision = input.gitlabContext.commitSha ?? input.gitlabContext.branch ?? "HEAD";
  log.info("creating vercel repository sandbox from gitlab git source");

  try {
    const workspace = await createVercelSandboxWorkspace({
      source: {
        type: "git",
        url: buildGitLabCloneUrl(access.value.baseUrl, input.gitlabContext.repositoryFullName),
        revision,
        depth: input.cloneDepth ?? 1,
        username: GITLAB_GIT_OAUTH_USERNAME,
        password: access.value.accessToken,
      },
      timeoutMs: input.timeoutMs,
    });
    log.info({ sandboxId: workspace.id }, "vercel gitlab repository sandbox created");
    return workspace.id;
  } catch (error) {
    log.error(
      { err: serializeErrorForLog(error) },
      "vercel gitlab repository sandbox creation failed",
    );
    throw error;
  }
}

export async function stopGitlabRepositorySandbox(sandboxId: string): Promise<void> {
  await stopWorkspace(sandboxId);
}
