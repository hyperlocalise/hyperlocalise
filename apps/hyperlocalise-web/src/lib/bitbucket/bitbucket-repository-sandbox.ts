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
import type { RepositoryAgentBitbucketContext } from "@/lib/agent-contracts/bitbucket-repository-task";
import {
  createVercelSandboxWorkspace,
  stopWorkspace,
} from "@/lib/agent-runtime/workspaces/vercel-sandbox-runtime";
import { createLogger, serializeErrorForLog } from "@/lib/log";
import { isErr } from "@/lib/primitives/result/results";

import { buildBitbucketCloneUrl, isBitbucketRepositoryFullName } from "./client";
import { BITBUCKET_GIT_TOKEN_USERNAME } from "./constants";
import { loadBitbucketAccess } from "./pipes";

const logger = createLogger("bitbucket-repository-sandbox");

/**
 * Clone a Bitbucket repository into a sandbox with the workspace's shared connection. The URL is
 * built from the fixed Bitbucket host, so the token never goes anywhere a context names.
 */
export async function createBitbucketRepositorySandbox(input: {
  localOrganizationId: string;
  bitbucketContext: RepositoryAgentBitbucketContext;
  cloneDepth?: number;
  timeoutMs?: number;
}): Promise<string> {
  const log = logger.child({
    repositoryUuid: input.bitbucketContext.repositoryUuid,
    revisionKind: input.bitbucketContext.branch ? "branch" : "head",
  });

  if (!isBitbucketRepositoryFullName(input.bitbucketContext.repositoryFullName)) {
    throw new Error("bitbucket_not_found");
  }

  log.info("resolving bitbucket access for repository sandbox");
  const access = await loadBitbucketAccess({ localOrganizationId: input.localOrganizationId });
  if (isErr(access)) {
    log.error({ err: access.error.code }, "bitbucket access unavailable for sandbox clone");
    throw new Error(access.error.code);
  }

  try {
    const workspace = await createVercelSandboxWorkspace({
      source: {
        type: "git",
        url: buildBitbucketCloneUrl(input.bitbucketContext.repositoryFullName),
        revision: input.bitbucketContext.branch ?? "HEAD",
        depth: input.cloneDepth ?? 1,
        username: BITBUCKET_GIT_TOKEN_USERNAME,
        password: access.value.accessToken,
      },
      ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
    });
    log.info({ sandboxId: workspace.id }, "vercel bitbucket repository sandbox created");
    return workspace.id;
  } catch (error) {
    log.error(
      { err: serializeErrorForLog(error) },
      "vercel bitbucket repository sandbox creation failed",
    );
    throw error;
  }
}

export async function stopBitbucketRepositorySandbox(sandboxId: string): Promise<void> {
  await stopWorkspace(sandboxId);
}
