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
import type { Result } from "@/lib/primitives/result/results";

/**
 * What content sync asks of a git hosting provider, in terms of files and reviews only, so the
 * sync code never speaks a provider's own terms. Connection setup, tokens and incoming webhooks
 * stay outside it: each provider resolves its own access and turns its own events into a run.
 *
 * The read half is what pulling needs. The write half is what delivering translations needs
 * and is written down here so an adapter can be checked against the whole before it is built.
 */
export type ContentSyncProviderError = {
  code:
    | "content_sync_connection_required"
    | "content_sync_repository_not_found"
    | "content_sync_branch_not_found"
    | "content_sync_file_not_found"
    | "content_sync_provider_failed";
  message: string;
};

export type ContentSyncBranchHead = {
  branch: string;
  /** The commit the run reads from; every read in a run uses it, so a push mid-run can't mix files. */
  commitSha: string;
};

export type ContentSyncRepositoryFile = {
  /** Repository-relative path, `/`-separated, no leading `/`. */
  path: string;
  /** The provider's id for the file's content, when it gives one. Not used yet. */
  contentId: string | null;
};

export type ContentSyncRepositoryReader = {
  /** The branch to read, or the repository's default branch when none is given. */
  resolveBranchHead(input: {
    branch?: string | null;
  }): Promise<Result<ContentSyncBranchHead, ContentSyncProviderError>>;
  /** Every file under the folder at the commit, folders included recursively. */
  listFiles(input: {
    commitSha: string;
    folder: string;
  }): Promise<Result<ContentSyncRepositoryFile[], ContentSyncProviderError>>;
  /** `content_sync_file_not_found` when the commit has no such file. */
  readFile(input: {
    commitSha: string;
    path: string;
  }): Promise<Result<Buffer, ContentSyncProviderError>>;
};

export type ContentSyncFileChange =
  | {
      path: string;
      content: Buffer;
      /** Whether the file is already on the branch, when the caller knows; else the writer asks. */
      exists?: boolean;
    }
  | { path: string; delete: true };

export type ContentSyncReview = {
  /** The provider's id for the review, e.g. a merge request's iid or a pull request's number. */
  id: string;
  url: string;
};

/** The write half, used by merge-request delivery. */
export type ContentSyncRepositoryWriter = {
  /**
   * Commits the changes as one commit on `startFrom`, creating the branch there or rebuilding
   * an existing one on it, so the branch is always one commit on the current target.
   */
  commitFiles(input: {
    branch: string;
    startFrom: ContentSyncBranchHead;
    message: string;
    changes: ContentSyncFileChange[];
  }): Promise<Result<{ commitSha: string }, ContentSyncProviderError>>;
  /**
   * Opens a review from the branch, or updates the open one's description (and target, when
   * it changed); an open review's title is left as it is.
   */
  upsertReview(input: {
    sourceBranch: string;
    targetBranch: string;
    title: string;
    description: string;
  }): Promise<Result<ContentSyncReview, ContentSyncProviderError>>;
  /** The open review from the branch, if any, so a run with nothing new can still link to it. */
  findOpenReview(
    sourceBranch: string,
  ): Promise<Result<ContentSyncReview | null, ContentSyncProviderError>>;
};
