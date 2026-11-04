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
import { createLogger } from "@/lib/log";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { gitlabJson } from "./client";
import type { GitLabAccess, GitLabApiError } from "./types";

const logger = createLogger("gitlab-content-sync-writer");

/** What a refused write means to the person reading the run; the status is logged, not shown. */
function writeError(error: GitLabApiError, what: "commit" | "review"): ContentSyncProviderError {
  if (error.code === "gitlab_unauthorized") {
    return {
      code: "content_sync_connection_required",
      message:
        "The workspace's GitLab token can't write to this repository. To send merge requests it needs the api scope and Developer access; a read-only token pulls only.",
    };
  }
  if (error.code === "gitlab_not_found") {
    return {
      code: "content_sync_repository_not_found",
      message: "The workspace's GitLab token can't see this repository any more.",
    };
  }
  if (error.code === "gitlab_request_failed") {
    logger.warn({ status: error.status, what }, "gitlab refused a content sync write");
    if (error.status === 400 || error.status === 422) {
      return {
        code: "content_sync_provider_failed",
        message:
          what === "commit"
            ? "GitLab refused the commit. The project's rules may require a commit message or branch name in a certain form, or the branch may be protected."
            : "GitLab refused the merge request. Merge requests may be turned off for this project, or its rules may refuse the branch.",
      };
    }
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

type OpenReview = ContentSyncReview & { targetBranch: string | null };

function parseReview(value: unknown): OpenReview | null {
  const record = asRecord(value);
  const iid = record?.iid;
  const url = record?.web_url;
  const target = record?.target_branch;
  return typeof iid === "number" && typeof url === "string" && url
    ? { id: String(iid), url, targetBranch: typeof target === "string" ? target : null }
    : null;
}

/**
 * The write half of the GitLab adapter. A sync's branch is rebuilt as one commit on the current
 * target each run (`start_sha` plus `force`), the way the GitHub path force-pushes, so a closed
 * or merged merge request, a moved target or a hand commit on the branch never leaves it stale.
 */
export function createGitLabContentSyncWriter(input: {
  access: GitLabAccess;
  pathWithNamespace: string;
  signal?: AbortSignal;
}): ContentSyncRepositoryWriter {
  const projectPath = `/api/v4/projects/${encodeURIComponent(input.pathWithNamespace)}`;
  const request = { ...input.access, signal: input.signal };

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
        : err(writeError(result.error, "commit"));
    }
    return ok(true);
  }

  async function commitFiles(options: {
    branch: string;
    startFrom: ContentSyncBranchHead;
    message: string;
    changes: ContentSyncFileChange[];
  }): Promise<Result<{ commitSha: string }, ContentSyncProviderError>> {
    const actions: Record<string, unknown>[] = [];
    for (const change of options.changes) {
      if ("delete" in change) {
        actions.push({ action: "delete", file_path: change.path });
        continue;
      }
      // Create or update is judged against the commit the branch is rebuilt from.
      let present = change.exists;
      if (present === undefined) {
        const lookup = await fileExists(change.path, options.startFrom.commitSha);
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
        start_sha: options.startFrom.commitSha,
        // Rebuilds an existing branch on the target's current commit; creates it otherwise.
        force: true,
        commit_message: options.message,
        actions,
      },
    });
    if (isErr(result)) {
      return err(writeError(result.error, "commit"));
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

  async function findOpen(
    sourceBranch: string,
  ): Promise<Result<OpenReview | null, ContentSyncProviderError>> {
    const open = await gitlabJson({
      ...request,
      path: `${projectPath}/merge_requests`,
      query: new URLSearchParams({ source_branch: sourceBranch, state: "opened", per_page: "1" }),
    });
    if (isErr(open)) {
      return err(writeError(open.error, "review"));
    }
    return ok(Array.isArray(open.value) ? parseReview(open.value[0]) : null);
  }

  async function upsertReview(options: {
    sourceBranch: string;
    targetBranch: string;
    title: string;
    description: string;
  }): Promise<Result<ContentSyncReview, ContentSyncProviderError>> {
    const current = await findOpen(options.sourceBranch);
    if (isErr(current)) {
      return err(current.error);
    }
    // The title is left alone once open, so a reviewer's "Draft:" mark survives the next run.
    const result = current.value
      ? await gitlabJson({
          ...request,
          method: "PUT",
          path: `${projectPath}/merge_requests/${current.value.id}`,
          body: {
            description: options.description,
            ...(current.value.targetBranch !== options.targetBranch
              ? { target_branch: options.targetBranch }
              : {}),
          },
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
      return err(writeError(result.error, "review"));
    }
    const review = parseReview(result.value);
    return review
      ? ok({ id: review.id, url: review.url })
      : err({
          code: "content_sync_provider_failed",
          message: "GitLab answered the merge request without its id or address.",
        });
  }

  async function findOpenReview(
    sourceBranch: string,
  ): Promise<Result<ContentSyncReview | null, ContentSyncProviderError>> {
    const found = await findOpen(sourceBranch);
    if (isErr(found)) {
      return found;
    }
    return ok(found.value ? { id: found.value.id, url: found.value.url } : null);
  }

  return { commitFiles, upsertReview, findOpenReview };
}
