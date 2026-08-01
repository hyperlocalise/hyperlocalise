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
import {
  createVercelSandboxWorkspace,
  stopWorkspace,
} from "@/lib/agent-runtime/workspaces/vercel-sandbox-runtime";
import type { RepositoryAgentGitLabContext } from "@/lib/agent-contracts/repository-task";
import { createLogger, serializeErrorForLog } from "@/lib/log";
import { isErr } from "@/lib/primitives/result/results";

import { getGitlabAccessToken } from "./tokens";

type ResolvedRepositoryGitLabContext = Extract<RepositoryAgentGitLabContext, { resolved: true }>;

const logger = createLogger("gitlab-repository-sandbox");

function buildGitlabCloneUrl(input: {
  httpUrlToRepo?: string;
  baseUrl: string;
  pathWithNamespace: string;
}): string {
  if (input.httpUrlToRepo?.trim()) {
    return input.httpUrlToRepo.trim().replace(/\.git$/i, "") + ".git";
  }

  const base = input.baseUrl.replace(/\/+$/, "");
  return `${base}/${input.pathWithNamespace.replace(/^\/+/, "")}.git`;
}

/**
 * Create a Vercel sandbox cloned from a GitLab project using a refreshed OAuth token.
 */
export async function createGitlabRepositorySandbox(
  gitlabContext: ResolvedRepositoryGitLabContext,
): Promise<string> {
  const log = logger.child({
    organizationId: gitlabContext.organizationId,
    pathWithNamespace: gitlabContext.pathWithNamespace,
    branch: gitlabContext.branch ?? null,
    commitSha: gitlabContext.commitSha ?? null,
  });

  log.info("resolving gitlab access token for repository sandbox");
  const tokenResult = await getGitlabAccessToken({
    organizationId: gitlabContext.organizationId,
    connectionId: gitlabContext.connectionId,
  });
  if (isErr(tokenResult)) {
    log.error({ err: tokenResult.error }, "failed to resolve gitlab access token");
    throw new Error(tokenResult.error.code);
  }

  const revision = gitlabContext.commitSha ?? gitlabContext.branch ?? "HEAD";
  const cloneUrl = buildGitlabCloneUrl({
    httpUrlToRepo: gitlabContext.httpUrlToRepo,
    baseUrl: tokenResult.value.baseUrl,
    pathWithNamespace: gitlabContext.pathWithNamespace,
  });

  log.info({ revision }, "creating vercel repository sandbox from gitlab git source");
  let workspace;
  try {
    workspace = await createVercelSandboxWorkspace({
      source: {
        type: "git",
        url: cloneUrl,
        revision,
        depth: 1,
        username: "oauth2",
        password: tokenResult.value.accessToken,
      },
    });
  } catch (error) {
    log.error(
      { err: serializeErrorForLog(error) },
      "vercel gitlab repository sandbox creation failed",
    );
    throw error;
  }

  log.info({ sandboxId: workspace.id }, "vercel gitlab repository sandbox created");
  return workspace.id;
}

export async function stopGitlabRepositorySandbox(sandboxId: string): Promise<void> {
  await stopWorkspace(sandboxId);
}
