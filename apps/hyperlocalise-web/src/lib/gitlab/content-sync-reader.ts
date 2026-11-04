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
  ContentSyncProviderError,
  ContentSyncRepositoryFile,
  ContentSyncRepositoryReader,
} from "@/lib/agents/content-sync/content-sync-provider";
import { normalizeContentSyncFolder } from "@/lib/agents/content-sync/content-sync-paths";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { getGitLabProject, gitlabBytes, gitlabJson } from "./client";
import type { GitLabAccess, GitLabApiError } from "./types";

const TREE_PAGE_SIZE = 100;
/** 10,000 files under one folder is well past any locale folder. */
/** A sync's own commit touches at most this many pages of files. */
const COMMIT_DIFF_MAX_PAGES = 20;
const TREE_MAX_PAGES = 100;

function providerError(error: GitLabApiError): ContentSyncProviderError {
  switch (error.code) {
    case "gitlab_unauthorized":
    case "gitlab_connection_decrypt_failed":
      return {
        code: "content_sync_connection_required",
        message: "The workspace's GitLab token was refused. Check the connection in Integrations.",
      };
    case "gitlab_not_found":
      return {
        code: "content_sync_repository_not_found",
        message: "The workspace's GitLab token can't see this repository.",
      };
    default:
      return {
        code: "content_sync_provider_failed",
        message: "GitLab couldn't be reached just now.",
      };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Content sync's view of one GitLab repository, over the REST API: no clone, so a server on a
 * developer's machine or behind a company network works the same as GitLab.com.
 */
export function createGitLabContentSyncReader(input: {
  access: GitLabAccess;
  pathWithNamespace: string;
  signal?: AbortSignal;
}): ContentSyncRepositoryReader {
  const projectPath = `/api/v4/projects/${encodeURIComponent(input.pathWithNamespace)}`;
  const request = { ...input.access, signal: input.signal };

  async function resolveBranchHead(options: {
    branch?: string | null;
  }): Promise<Result<ContentSyncBranchHead, ContentSyncProviderError>> {
    let branch = options.branch?.trim() ?? "";
    if (!branch) {
      const project = await getGitLabProject({
        ...request,
        pathWithNamespace: input.pathWithNamespace,
      });
      if (isErr(project)) {
        return err(providerError(project.error));
      }
      if (!project.value.defaultBranch) {
        return err({
          code: "content_sync_branch_not_found",
          message: "This repository has no default branch yet. Choose a branch to sync.",
        });
      }
      branch = project.value.defaultBranch;
    }
    const result = await gitlabJson({
      ...request,
      path: `${projectPath}/repository/branches/${encodeURIComponent(branch)}`,
    });
    if (isErr(result)) {
      return err(
        result.error.code === "gitlab_not_found"
          ? {
              code: "content_sync_branch_not_found",
              message: `The branch ${branch} was not found in this repository.`,
            }
          : providerError(result.error),
      );
    }
    const commit = asRecord(asRecord(result.value)?.commit);
    const commitSha = commit?.id;
    if (typeof commitSha !== "string" || !commitSha) {
      return err({
        code: "content_sync_provider_failed",
        message: "GitLab answered without the branch's commit.",
      });
    }
    const parents = Array.isArray(commit?.parent_ids)
      ? commit.parent_ids.filter((id): id is string => typeof id === "string")
      : [];
    return ok({ branch, commitSha, parentCommitShas: parents });
  }

  async function listFiles(options: {
    commitSha: string;
    folder: string;
  }): Promise<Result<ContentSyncRepositoryFile[], ContentSyncProviderError>> {
    const files: ContentSyncRepositoryFile[] = [];
    const folder = normalizeContentSyncFolder(options.folder);
    // One page past the cap, so a folder with exactly the cap's entries isn't refused.
    for (let page = 1; page <= TREE_MAX_PAGES + 1; page += 1) {
      const query = new URLSearchParams({
        ref: options.commitSha,
        recursive: "true",
        per_page: String(TREE_PAGE_SIZE),
        page: String(page),
      });
      if (folder) {
        query.set("path", folder);
      }
      const result = await gitlabJson({
        ...request,
        path: `${projectPath}/repository/tree`,
        query,
      });
      if (isErr(result)) {
        // A folder the branch doesn't have is an empty listing, which the caller reports.
        if (result.error.code === "gitlab_not_found" && page === 1) {
          return ok(files);
        }
        return err(providerError(result.error));
      }
      if (!Array.isArray(result.value)) {
        return err({
          code: "content_sync_provider_failed",
          message: "GitLab answered the file listing in an unexpected shape.",
        });
      }
      for (const item of result.value) {
        const entry = asRecord(item);
        if (entry?.type !== "blob" || typeof entry.path !== "string") {
          continue;
        }
        files.push({ path: entry.path, contentId: typeof entry.id === "string" ? entry.id : null });
      }
      if (page > TREE_MAX_PAGES && result.value.length > 0) {
        break;
      }
      if (result.value.length < TREE_PAGE_SIZE) {
        return ok(files);
      }
    }
    return err({
      code: "content_sync_provider_failed",
      message: `The provider folder holds more than ${TREE_PAGE_SIZE * TREE_MAX_PAGES} entries. Choose a smaller folder.`,
    });
  }

  async function readFile(options: {
    commitSha: string;
    path: string;
  }): Promise<Result<Buffer, ContentSyncProviderError>> {
    const result = await gitlabBytes({
      ...request,
      path: `${projectPath}/repository/files/${encodeURIComponent(options.path)}/raw`,
      query: new URLSearchParams({ ref: options.commitSha }),
    });
    if (isErr(result)) {
      // The project was reached already, so a 404 here is the file, not the repository.
      return err(
        result.error.code === "gitlab_not_found"
          ? {
              code: "content_sync_file_not_found",
              message: `The repository has no file ${options.path} at this commit.`,
            }
          : providerError(result.error),
      );
    }
    return result;
  }

  async function listCommitPaths(options: {
    commitSha: string;
  }): Promise<Result<string[], ContentSyncProviderError>> {
    const paths = new Set<string>();
    for (let page = 1; page <= COMMIT_DIFF_MAX_PAGES; page += 1) {
      const result = await gitlabJson({
        ...request,
        path: `${projectPath}/repository/commits/${encodeURIComponent(options.commitSha)}/diff`,
        query: new URLSearchParams({ per_page: String(TREE_PAGE_SIZE), page: String(page) }),
      });
      if (isErr(result)) {
        return err(providerError(result.error));
      }
      if (!Array.isArray(result.value)) {
        return err({
          code: "content_sync_provider_failed",
          message: "GitLab answered the commit's changes in an unexpected shape.",
        });
      }
      for (const diff of result.value) {
        const entry = asRecord(diff);
        for (const path of [entry?.new_path, entry?.old_path]) {
          if (typeof path === "string" && path) {
            paths.add(path);
          }
        }
      }
      if (result.value.length < TREE_PAGE_SIZE) {
        return ok([...paths]);
      }
    }
    return err({
      code: "content_sync_provider_failed",
      message: "The sync branch's commit changes more files than can be checked.",
    });
  }

  return { resolveBranchHead, listFiles, readFile, listCommitPaths };
}
