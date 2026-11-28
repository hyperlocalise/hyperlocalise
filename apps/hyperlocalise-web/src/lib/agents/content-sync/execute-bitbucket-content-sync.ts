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
import { getBitbucketRepository } from "@/lib/bitbucket/client";
import { resolveBitbucketAccess } from "@/lib/bitbucket/connections";
import { createBitbucketContentSyncReader } from "@/lib/bitbucket/content-sync-reader";
import { createBitbucketContentSyncWriter } from "@/lib/bitbucket/content-sync-writer";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { BITBUCKET_CONTENT_SYNC_UPLOAD_SURFACE } from "./content-sync-types";
import type { ContentSyncError } from "./execute-github-content-sync";
import {
  executeRepositoryContentSync,
  type RepositoryContentSyncInput,
  type RepositoryContentSyncSummary,
  type ResolvedContentSyncRepository,
} from "./execute-gitlab-content-sync";

/**
 * Bitbucket Cloud content sync: the same pull and pull-request delivery as GitLab's, through the
 * workspace's Bitbucket connection. `connectionId` holds the repository's uuid and `resourceKey`
 * its `workspace/repo-slug`.
 */
export async function executeBitbucketContentSync(
  input: RepositoryContentSyncInput,
): Promise<Result<RepositoryContentSyncSummary, ContentSyncError>> {
  return executeRepositoryContentSync({
    ...input,
    providerName: "Bitbucket",
    uploadSurface: BITBUCKET_CONTENT_SYNC_UPLOAD_SURFACE,
    resolveRepository: () => resolveBitbucketRepository(input),
  });
}

export async function resolveBitbucketRepository(
  input: Pick<RepositoryContentSyncInput, "organizationId" | "syncConfig">,
): Promise<Result<ResolvedContentSyncRepository, ContentSyncError>> {
  const access = await resolveBitbucketAccess({
    organizationId: input.organizationId,
    connectionId: input.syncConfig.bitbucketConnectionId,
  });
  if (isErr(access)) {
    return err({
      code: "content_sync_connection_required",
      message:
        access.error.code === "bitbucket_connection_decrypt_failed"
          ? "The sync's saved Bitbucket token can't be read. Save the connection again in Integrations."
          : access.error.code === "bitbucket_connection_removed"
            ? "The Bitbucket connection this sync uses was removed in Integrations. Choose another connection in the project's Sync settings."
            : "Connect Bitbucket in Integrations before syncing.",
    });
  }
  // The path is what every call uses; the uuid proves it still names the repository chosen,
  // not another one that took its name after a rename.
  const repository = await getBitbucketRepository({
    ...access.value,
    fullName: input.syncConfig.resourceKey,
  });
  if (isErr(repository)) {
    return err({
      code: "content_sync_connection_required",
      message:
        repository.error.code === "bitbucket_not_found"
          ? "The workspace's Bitbucket token can't see this repository. Check the connection in Integrations."
          : repository.error.code === "bitbucket_unauthorized" ||
              repository.error.code === "bitbucket_forbidden"
            ? "The workspace's Bitbucket token was refused. Check the connection in Integrations."
            : "Bitbucket couldn't be reached. Try again shortly.",
    });
  }
  if (repository.value.uuid !== input.syncConfig.connectionId) {
    return err({
      code: "content_sync_connection_required",
      message:
        "The repository at this path is not the one chosen for this sync. Choose the repository again.",
    });
  }
  const credentials = {
    accessToken: access.value.accessToken,
    accountEmail: access.value.accountEmail,
  };
  return ok({
    reader: createBitbucketContentSyncReader({
      access: credentials,
      fullName: repository.value.fullName,
    }),
    writer: createBitbucketContentSyncWriter({
      access: credentials,
      fullName: repository.value.fullName,
    }),
  });
}
