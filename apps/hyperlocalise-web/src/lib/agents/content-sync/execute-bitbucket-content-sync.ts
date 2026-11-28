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
import { loadBitbucketAccess } from "@/lib/bitbucket/pipes";
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
 * workspace's shared Bitbucket connection (WorkOS Pipes, organization-owned). `connectionId` holds the repository's uuid and `resourceKey`
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
  const access = await loadBitbucketAccess({ localOrganizationId: input.organizationId });
  if (isErr(access)) {
    // Each reason names what to do: connect, reconnect, or try again later.
    return err({ code: "content_sync_connection_required", message: access.error.message });
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
          ? "The Bitbucket account connected for this workspace can't see this repository. Check the connection in Integrations."
          : repository.error.code === "bitbucket_unauthorized" ||
              repository.error.code === "bitbucket_forbidden"
            ? "Bitbucket refused the workspace's connection. Reconnect Bitbucket in Integrations."
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
  const credentials = access.value;
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
