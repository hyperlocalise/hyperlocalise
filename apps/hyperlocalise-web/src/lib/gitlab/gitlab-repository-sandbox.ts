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

import { GITLAB_GIT_OAUTH_USERNAME } from "./constants";
import { loadGitLabPipesAccessToken } from "./pipes";

const logger = createLogger("gitlab-repository-sandbox");

export async function createGitlabRepositorySandbox(input: {
  localOrganizationId: string;
  workosUserId: string;
  gitlabContext: RepositoryAgentGitLabContext;
  cloneDepth?: number;
}): Promise<string> {
  const log = logger.child({
    projectId: input.gitlabContext.projectId,
    branch: input.gitlabContext.branch ?? null,
    commitSha: input.gitlabContext.commitSha ?? null,
  });
  log.info("vending gitlab pipes access token for repository sandbox");

  const tokenResult = await loadGitLabPipesAccessToken({
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(tokenResult)) {
    log.error({ err: tokenResult.error.code }, "gitlab pipes token unavailable for sandbox clone");
    throw new Error(tokenResult.error.code);
  }

  const revision = input.gitlabContext.commitSha ?? input.gitlabContext.branch ?? "HEAD";
  log.info({ revision }, "creating vercel repository sandbox from gitlab git source");

  try {
    const workspace = await createVercelSandboxWorkspace({
      source: {
        type: "git",
        url: input.gitlabContext.httpUrlToRepo,
        revision,
        depth: input.cloneDepth ?? 1,
        username: GITLAB_GIT_OAUTH_USERNAME,
        password: tokenResult.value,
      },
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
