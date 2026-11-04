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
  /** The commit's parents, when the provider gives them; a sync branch is checked to sit on the target. */
  parentCommitShas?: string[];
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
  /** The paths one commit adds, changes or removes against its parent. */
  listCommitPaths(input: {
    commitSha: string;
  }): Promise<Result<string[], ContentSyncProviderError>>;
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

export type ContentSyncReviewState = "open" | "closed" | "merged";

export type ContentSyncReviewDetails = ContentSyncReview & {
  state: ContentSyncReviewState;
  /** The content fingerprint the sync wrote into it, when it did. */
  fingerprint: string | null;
  /** Whether the sync itself closed it; a reviewer's close is respected, the sync's own is not. */
  closedBySync: boolean;
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
   * it changed); an open review's title is left as it is. The fingerprint names the content.
   */
  upsertReview(input: {
    sourceBranch: string;
    targetBranch: string;
    title: string;
    description: string;
    fingerprint: string;
  }): Promise<Result<ContentSyncReview, ContentSyncProviderError>>;
  /**
   * The branch's own newest review in any state (an open one first, the one into `targetBranch`
   * before others), so a run can link it, leave a closed one closed, or open a new one.
   */
  findReview(input: {
    sourceBranch: string;
    targetBranch: string;
  }): Promise<Result<ContentSyncReviewDetails | null, ContentSyncProviderError>>;
  /** Closes an open review, saying why in it, so a later run knows the sync closed it. */
  closeReview(input: {
    id: string;
    reason: string;
  }): Promise<Result<void, ContentSyncProviderError>>;
  /** Removes the sync's branch, so the next run with something to send starts afresh. */
  deleteBranch(branch: string): Promise<Result<void, ContentSyncProviderError>>;
};
