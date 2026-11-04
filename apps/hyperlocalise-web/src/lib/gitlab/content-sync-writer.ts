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
import type {
  ContentSyncBranchHead,
  ContentSyncFileChange,
  ContentSyncProviderError,
  ContentSyncRepositoryWriter,
  ContentSyncReview,
} from "@/lib/agents/content-sync/content-sync-provider";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { gitlabJson } from "./client";
import type { GitLabAccess, GitLabApiError } from "./types";

function providerError(error: GitLabApiError): ContentSyncProviderError {
  if (error.code === "gitlab_unauthorized") {
    return {
      code: "content_sync_connection_required",
      message:
        "The workspace's GitLab token can't write to this repository. It needs the api scope and Developer access.",
    };
  }
  if (error.code === "gitlab_not_found") {
    return {
      code: "content_sync_repository_not_found",
      message: "The workspace's GitLab token can't see this repository any more.",
    };
  }
  return {
    code: "content_sync_provider_failed",
    message: "The workspace's GitLab server didn't accept the translations. Try again later.",
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseReview(value: unknown): ContentSyncReview | null {
  const record = asRecord(value);
  const iid = record?.iid;
  const url = record?.web_url;
  return typeof iid === "number" && typeof url === "string" && url
    ? { id: String(iid), url }
    : null;
}

/** The write half of the GitLab adapter: one commit per run on a branch, and its merge request. */
export function createGitLabContentSyncWriter(input: {
  access: GitLabAccess;
  pathWithNamespace: string;
  signal?: AbortSignal;
}): ContentSyncRepositoryWriter {
  const projectPath = `/api/v4/projects/${encodeURIComponent(input.pathWithNamespace)}`;
  const request = { ...input.access, signal: input.signal };

  async function branchExists(branch: string): Promise<Result<boolean, ContentSyncProviderError>> {
    const result = await gitlabJson({
      ...request,
      path: `${projectPath}/repository/branches/${encodeURIComponent(branch)}`,
    });
    if (isErr(result)) {
      return result.error.code === "gitlab_not_found"
        ? ok(false)
        : err(providerError(result.error));
    }
    return ok(true);
  }

  async function fileExists(
    path: string,
    ref: string,
  ): Promise<Result<boolean, ContentSyncProviderError>> {
    const result = await gitlabJson({
      ...request,
      path: `${projectPath}/repository/files/${encodeURIComponent(path)}`,
      query: new URLSearchParams({ ref }),
    });
    if (isErr(result)) {
      return result.error.code === "gitlab_not_found"
        ? ok(false)
        : err(providerError(result.error));
    }
    return ok(true);
  }

  async function commitFiles(options: {
    branch: string;
    startFrom: ContentSyncBranchHead;
    message: string;
    changes: ContentSyncFileChange[];
  }): Promise<Result<{ commitSha: string }, ContentSyncProviderError>> {
    const exists = await branchExists(options.branch);
    if (isErr(exists)) {
      return exists;
    }
    // GitLab refuses a start branch for a branch it already has, and a create for a file it has.
    const baseRef = exists.value ? options.branch : options.startFrom.commitSha;
    const actions: Record<string, unknown>[] = [];
    for (const change of options.changes) {
      if ("delete" in change) {
        actions.push({ action: "delete", file_path: change.path });
        continue;
      }
      let present = change.exists;
      if (present === undefined) {
        const lookup = await fileExists(change.path, baseRef);
        if (isErr(lookup)) {
          return err(lookup.error);
        }
        present = lookup.value;
      }
      actions.push({
        action: present ? "update" : "create",
        file_path: change.path,
        content: change.content.toString("base64"),
        encoding: "base64",
      });
    }
    const result = await gitlabJson({
      ...request,
      method: "POST",
      path: `${projectPath}/repository/commits`,
      body: {
        branch: options.branch,
        ...(exists.value ? {} : { start_branch: options.startFrom.branch }),
        commit_message: options.message,
        actions,
      },
    });
    if (isErr(result)) {
      return err(providerError(result.error));
    }
    const commitSha = asRecord(result.value)?.id;
    if (typeof commitSha !== "string" || !commitSha) {
      return err({
        code: "content_sync_provider_failed",
        message: "GitLab answered the commit without its id.",
      });
    }
    return ok({ commitSha });
  }

  async function upsertReview(options: {
    sourceBranch: string;
    targetBranch: string;
    title: string;
    description: string;
  }): Promise<Result<ContentSyncReview, ContentSyncProviderError>> {
    const open = await gitlabJson({
      ...request,
      path: `${projectPath}/merge_requests`,
      query: new URLSearchParams({
        source_branch: options.sourceBranch,
        target_branch: options.targetBranch,
        state: "opened",
        per_page: "1",
      }),
    });
    if (isErr(open)) {
      return err(providerError(open.error));
    }
    const current = Array.isArray(open.value) ? parseReview(open.value[0]) : null;
    const result = current
      ? await gitlabJson({
          ...request,
          method: "PUT",
          path: `${projectPath}/merge_requests/${current.id}`,
          body: { title: options.title, description: options.description },
        })
      : await gitlabJson({
          ...request,
          method: "POST",
          path: `${projectPath}/merge_requests`,
          body: {
            source_branch: options.sourceBranch,
            target_branch: options.targetBranch,
            title: options.title,
            description: options.description,
            remove_source_branch: true,
          },
        });
    if (isErr(result)) {
      return err(providerError(result.error));
    }
    const review = parseReview(result.value);
    return review
      ? ok(review)
      : err({
          code: "content_sync_provider_failed",
          message: "GitLab answered the merge request without its id or address.",
        });
  }

  return { commitFiles, upsertReview };
}
