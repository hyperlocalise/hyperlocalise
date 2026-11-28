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

import {
  asRecord,
  bitbucketBytes,
  bitbucketJson,
  bitbucketPages,
  bitbucketRepositoryPath,
  encodeBitbucketFilePath,
  getBitbucketRepository,
} from "./client";
import type { BitbucketAccess, BitbucketApiError } from "./types";

const PAGE_SIZE = 100;
/** 10,000 entries under one folder is well past any locale folder. */
const MAX_ENTRIES = 10_000;
/** Folder listings asked for at most; each folder is one request or more. */
const MAX_LISTING_REQUESTS = 500;
/** A sync's own commit touches at most this many pages of files; past that it is rebuilt. */
const COMMIT_DIFF_MAX_PAGES = 20;

export function bitbucketProviderError(error: BitbucketApiError): ContentSyncProviderError {
  switch (error.code) {
    case "bitbucket_unauthorized":
    case "bitbucket_forbidden":
    case "bitbucket_connection_decrypt_failed":
    case "bitbucket_connection_removed":
    case "bitbucket_not_connected":
      return {
        code: "content_sync_connection_required",
        message:
          "The workspace's Bitbucket token was refused. Check the connection in Integrations.",
      };
    case "bitbucket_not_found":
      return {
        code: "content_sync_repository_not_found",
        message: "The workspace's Bitbucket token can't see this repository.",
      };
    default:
      return {
        code: "content_sync_provider_failed",
        message: "Bitbucket couldn't be reached just now.",
      };
  }
}

const TOO_MANY_ENTRIES: ContentSyncProviderError = {
  code: "content_sync_provider_failed",
  message: `The provider folder holds more than ${MAX_ENTRIES} entries. Choose a smaller folder.`,
};

/**
 * Content sync's view of one Bitbucket Cloud repository, over the REST API: no clone. Bitbucket
 * gives no git blob ids in its listings, so files come back with a null `contentId`.
 */
export function createBitbucketContentSyncReader(input: {
  access: BitbucketAccess;
  fullName: string;
  signal?: AbortSignal;
}): ContentSyncRepositoryReader {
  const repositoryPath = bitbucketRepositoryPath(input.fullName);
  const request = { ...input.access, signal: input.signal };

  async function resolveBranchHead(options: {
    branch?: string | null;
  }): Promise<Result<ContentSyncBranchHead, ContentSyncProviderError>> {
    let branch = options.branch?.trim() ?? "";
    if (!branch) {
      const repository = await getBitbucketRepository({ ...request, fullName: input.fullName });
      if (isErr(repository)) {
        return err(bitbucketProviderError(repository.error));
      }
      if (!repository.value.mainBranch) {
        return err({
          code: "content_sync_branch_not_found",
          message: "This repository has no main branch yet. Choose a branch to sync.",
        });
      }
      branch = repository.value.mainBranch;
    }
    const result = await bitbucketJson({
      ...request,
      path: `${repositoryPath}/refs/branches/${encodeURIComponent(branch)}`,
    });
    if (isErr(result)) {
      return err(
        result.error.code === "bitbucket_not_found"
          ? {
              code: "content_sync_branch_not_found",
              message: `The branch ${branch} was not found in this repository.`,
            }
          : bitbucketProviderError(result.error),
      );
    }
    const target = asRecord(asRecord(result.value)?.target);
    const commitSha = target?.hash;
    if (typeof commitSha !== "string" || !commitSha) {
      return err({
        code: "content_sync_provider_failed",
        message: "Bitbucket answered without the branch's commit.",
      });
    }
    const parents = Array.isArray(target?.parents)
      ? target.parents
          .map((parent) => asRecord(parent)?.hash)
          .filter((hash): hash is string => typeof hash === "string")
      : [];
    return ok({ branch, commitSha, parentCommitShas: parents });
  }

  async function listFiles(options: {
    commitSha: string;
    folder: string;
  }): Promise<Result<ContentSyncRepositoryFile[], ContentSyncProviderError>> {
    const files: ContentSyncRepositoryFile[] = [];
    const root = normalizeContentSyncFolder(options.folder);
    // One folder at a time: a deep recursive listing can time out on Bitbucket's side.
    const folders = [root];
    let requests = 0;
    let entries = 0;
    while (folders.length > 0) {
      const folder = folders.shift()!;
      const encoded = encodeBitbucketFilePath(folder);
      const remaining = MAX_LISTING_REQUESTS - requests;
      if (remaining <= 0) {
        return err(TOO_MANY_ENTRIES);
      }
      const result = await bitbucketPages({
        ...request,
        path: `${repositoryPath}/src/${encodeURIComponent(options.commitSha)}/${encoded ? `${encoded}/` : ""}`,
        query: new URLSearchParams({
          pagelen: String(PAGE_SIZE),
          fields: "next,values.path,values.type",
        }),
        maxPages: remaining,
      });
      if (isErr(result)) {
        // A folder the branch doesn't have is an empty listing, which the caller reports.
        if (result.error.code === "bitbucket_not_found" && folder === root) {
          return ok(files);
        }
        return err(bitbucketProviderError(result.error));
      }
      if (result.value.truncated) {
        return err(TOO_MANY_ENTRIES);
      }
      requests += Math.max(1, Math.ceil(result.value.values.length / PAGE_SIZE));
      for (const value of result.value.values) {
        const entry = asRecord(value);
        if (typeof entry?.path !== "string" || !entry.path) {
          continue;
        }
        entries += 1;
        if (entries > MAX_ENTRIES) {
          return err(TOO_MANY_ENTRIES);
        }
        if (entry.type === "commit_directory") {
          folders.push(entry.path);
        } else if (entry.type === "commit_file") {
          files.push({ path: entry.path, contentId: null });
        }
      }
    }
    return ok(files);
  }

  async function readFile(options: {
    commitSha: string;
    path: string;
  }): Promise<Result<Buffer, ContentSyncProviderError>> {
    const result = await bitbucketBytes({
      ...request,
      path: `${repositoryPath}/src/${encodeURIComponent(options.commitSha)}/${encodeBitbucketFilePath(options.path)}`,
    });
    if (isErr(result)) {
      // The repository was reached already, so a 404 here is the file, not the repository.
      return err(
        result.error.code === "bitbucket_not_found"
          ? {
              code: "content_sync_file_not_found",
              message: `The repository has no file ${options.path} at this commit.`,
            }
          : bitbucketProviderError(result.error),
      );
    }
    return result;
  }

  async function listCommitPaths(options: {
    commitSha: string;
  }): Promise<Result<string[] | null, ContentSyncProviderError>> {
    const result = await bitbucketPages({
      ...request,
      path: `${repositoryPath}/diffstat/${encodeURIComponent(options.commitSha)}`,
      query: new URLSearchParams({
        pagelen: String(PAGE_SIZE),
        fields: "next,values.old.path,values.new.path",
      }),
      maxPages: COMMIT_DIFF_MAX_PAGES,
    });
    if (isErr(result)) {
      return err(bitbucketProviderError(result.error));
    }
    if (result.value.truncated) {
      return ok(null);
    }
    const paths = new Set<string>();
    for (const value of result.value.values) {
      const entry = asRecord(value);
      for (const side of [entry?.new, entry?.old]) {
        const path = asRecord(side)?.path;
        if (typeof path === "string" && path) {
          paths.add(path);
        }
      }
    }
    return ok([...paths]);
  }

  return { resolveBranchHead, listFiles, readFile, listCommitPaths };
}
