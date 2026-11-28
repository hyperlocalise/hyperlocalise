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
  ContentSyncReviewDetails,
} from "@/lib/agents/content-sync/content-sync-provider";
import { createLogger } from "@/lib/log";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { asRecord, bitbucketJson, bitbucketRequest, bitbucketRepositoryPath } from "./client";
import type { BitbucketAccess, BitbucketApiError } from "./types";

const logger = createLogger("bitbucket-content-sync-writer");

/** What a refused write means to the person reading the run; the status is logged, not shown. */
function writeError(error: BitbucketApiError, what: "commit" | "review"): ContentSyncProviderError {
  if (error.code === "bitbucket_unauthorized" || error.code === "bitbucket_forbidden") {
    return {
      code: "content_sync_connection_required",
      message:
        what === "commit"
          ? "Bitbucket refused the write: the workspace's token can't push here, or a branch restriction covers the sync branch (hyperlocalise/translations-…). To send pull requests the token needs write access to repositories and pull requests; a read-only token pulls only."
          : "Bitbucket refused the pull request: the workspace's token needs write access to pull requests.",
    };
  }
  if (error.code === "bitbucket_not_found") {
    return {
      code: "content_sync_repository_not_found",
      message: "The workspace's Bitbucket token can't see this repository any more.",
    };
  }
  if (error.code === "bitbucket_request_failed") {
    logger.warn({ status: error.status, what }, "bitbucket refused a content sync write");
    if (error.status === 409) {
      return {
        code: "content_sync_provider_failed",
        message:
          "The sync branch changed while the translations were being sent. Run the sync again.",
      };
    }
    if (error.status === 400) {
      return {
        code: "content_sync_provider_failed",
        message:
          what === "commit"
            ? "Bitbucket refused the commit. A branch restriction or a merge check may cover the sync branch."
            : "Bitbucket refused the pull request. The repository's settings may refuse the branch.",
      };
    }
  }
  return {
    code: "content_sync_provider_failed",
    message: "Bitbucket didn't accept the translations. Try again later.",
  };
}

type Review = ContentSyncReviewDetails & {
  title: string;
  description: string;
  targetBranch: string | null;
  /** From a fork: never the sync's own. */
  foreign: boolean;
};

/**
 * Hidden in the description as Markdown reference definitions, which Bitbucket doesn't show:
 * what content the pull request holds, and whether the sync closed it.
 */
const FINGERPRINT_MARK = /\[\/\/\]: # \(hyperlocalise-sync:fingerprint=([0-9a-f]+)\)/;
const CLOSED_MARK = "[//]: # (hyperlocalise-sync:closed)";

function fingerprintLine(fingerprint: string): string {
  return `[//]: # (hyperlocalise-sync:fingerprint=${fingerprint})`;
}

function parseReview(value: unknown): Review | null {
  const record = asRecord(value);
  const id = record?.id;
  const url = asRecord(asRecord(record?.links)?.html)?.href;
  if (!record || typeof id !== "number" || typeof url !== "string" || !url) {
    return null;
  }
  const state = record.state === "MERGED" ? "merged" : record.state === "OPEN" ? "open" : "closed";
  const description = typeof record.description === "string" ? record.description : "";
  const source = asRecord(record.source);
  const destination = asRecord(record.destination);
  const sourceRepository = asRecord(source?.repository)?.uuid;
  const destinationRepository = asRecord(destination?.repository)?.uuid;
  const targetBranch = asRecord(destination?.branch)?.name;
  return {
    id: String(id),
    url,
    state,
    title: typeof record.title === "string" ? record.title : "",
    description,
    fingerprint: FINGERPRINT_MARK.exec(description)?.[1] ?? null,
    closedBySync: description.includes(CLOSED_MARK),
    targetBranch: typeof targetBranch === "string" ? targetBranch : null,
    foreign:
      typeof sourceRepository === "string" &&
      typeof destinationRepository === "string" &&
      sourceRepository !== destinationRepository,
  };
}

/** The commit a `src` write made, from the address it answers with. */
function commitShaFromLocation(location: string | null): string | null {
  return location ? (/\/commit\/([0-9a-f]{7,64})(?:[/?#]|$)/i.exec(location)?.[1] ?? null) : null;
}

/**
 * The write half of the Bitbucket Cloud adapter. Bitbucket can't move a branch to another commit,
 * so a sync branch that doesn't sit on the current target is deleted and made again there as one
 * commit, which keeps it in the shape the GitLab and GitHub paths leave theirs.
 */
export function createBitbucketContentSyncWriter(input: {
  access: BitbucketAccess;
  fullName: string;
  signal?: AbortSignal;
}): ContentSyncRepositoryWriter {
  const repositoryPath = bitbucketRepositoryPath(input.fullName);
  const request = { ...input.access, signal: input.signal };

  async function branchHead(
    branch: string,
  ): Promise<Result<string | null, ContentSyncProviderError>> {
    const result = await bitbucketJson({
      ...request,
      path: `${repositoryPath}/refs/branches/${encodeURIComponent(branch)}`,
    });
    if (isErr(result)) {
      return result.error.code === "bitbucket_not_found"
        ? ok(null)
        : err(writeError(result.error, "commit"));
    }
    const hash = asRecord(asRecord(result.value)?.target)?.hash;
    return ok(typeof hash === "string" ? hash : null);
  }

  async function deleteBranch(branch: string): Promise<Result<void, ContentSyncProviderError>> {
    const result = await bitbucketJson({
      ...request,
      method: "DELETE",
      path: `${repositoryPath}/refs/branches/${encodeURIComponent(branch)}`,
    });
    if (isErr(result) && result.error.code !== "bitbucket_not_found") {
      return err(writeError(result.error, "commit"));
    }
    return ok(undefined);
  }

  async function commitFiles(options: {
    branch: string;
    startFrom: ContentSyncBranchHead;
    message: string;
    changes: ContentSyncFileChange[];
  }): Promise<Result<{ commitSha: string }, ContentSyncProviderError>> {
    // With `parents`, Bitbucket commits on an existing branch only when it is at that commit;
    // a branch anywhere else is dropped so the commit can make it again on the target.
    const current = await branchHead(options.branch);
    if (isErr(current)) {
      return current;
    }
    if (current.value !== null && current.value !== options.startFrom.commitSha) {
      const deleted = await deleteBranch(options.branch);
      if (isErr(deleted)) {
        return deleted;
      }
    }

    const form = new FormData();
    form.append("message", options.message);
    form.append("branch", options.branch);
    form.append("parents", options.startFrom.commitSha);
    for (const change of options.changes) {
      if ("delete" in change) {
        // A path named in `files` with no content of its own is removed.
        form.append("files", change.path);
      } else {
        form.append(change.path, new Blob([new Uint8Array(change.content)]), change.path);
      }
    }
    const result = await bitbucketRequest({
      ...request,
      method: "POST",
      path: `${repositoryPath}/src`,
      form,
      accept: "application/json",
    });
    if (isErr(result)) {
      return err(writeError(result.error, "commit"));
    }
    const commitSha = commitShaFromLocation(result.value.headers.get("location"));
    if (commitSha) {
      return ok({ commitSha });
    }
    // An answer without the address: the branch was just made, so its head is the commit.
    const head = await branchHead(options.branch);
    if (isErr(head)) {
      return head;
    }
    return head.value
      ? ok({ commitSha: head.value })
      : err({
          code: "content_sync_provider_failed",
          message: "Bitbucket answered the commit without its id.",
        });
  }

  async function getReview(id: string): Promise<Result<Review, ContentSyncProviderError>> {
    const result = await bitbucketJson({
      ...request,
      path: `${repositoryPath}/pullrequests/${encodeURIComponent(id)}`,
    });
    if (isErr(result)) {
      return err(writeError(result.error, "review"));
    }
    const review = parseReview(result.value);
    return review
      ? ok(review)
      : err({
          code: "content_sync_provider_failed",
          message: "Bitbucket answered the pull request without its id or address.",
        });
  }

  /** The branch's own pull requests in every state, newest first; forks' are left out. */
  async function listReviews(
    sourceBranch: string,
  ): Promise<Result<Review[], ContentSyncProviderError>> {
    const query = new URLSearchParams({
      q: `source.branch.name = "${sourceBranch.replace(/["\\]/g, "\\$&")}"`,
      sort: "-created_on",
      pagelen: "20",
    });
    for (const state of ["OPEN", "MERGED", "DECLINED", "SUPERSEDED"]) {
      query.append("state", state);
    }
    const result = await bitbucketJson({
      ...request,
      path: `${repositoryPath}/pullrequests`,
      query,
    });
    if (isErr(result)) {
      return err(writeError(result.error, "review"));
    }
    const values = asRecord(result.value)?.values;
    const reviews = Array.isArray(values)
      ? values.map(parseReview).filter((review): review is Review => review !== null)
      : [];
    return ok(reviews.filter((review) => !review.foreign));
  }

  /** An open one into the target first, else the oldest open one, else the newest of any state. */
  function pick(reviews: Review[], targetBranch: string): Review | null {
    const open = reviews.filter((review) => review.state === "open");
    return (
      open.find((review) => review.targetBranch === targetBranch) ??
      open.at(-1) ??
      reviews[0] ??
      null
    );
  }

  /** The picked pull request in full: a listing may leave its description out. */
  async function findPicked(
    sourceBranch: string,
    targetBranch: string,
    openOnly: boolean,
  ): Promise<Result<Review | null, ContentSyncProviderError>> {
    const reviews = await listReviews(sourceBranch);
    if (isErr(reviews)) {
      return reviews;
    }
    const candidates = openOnly
      ? reviews.value.filter((review) => review.state === "open")
      : reviews.value;
    const picked = pick(candidates, targetBranch);
    return picked ? getReview(picked.id) : ok(null);
  }

  async function findReview(options: {
    sourceBranch: string;
    targetBranch: string;
  }): Promise<Result<ContentSyncReviewDetails | null, ContentSyncProviderError>> {
    const review = await findPicked(options.sourceBranch, options.targetBranch, false);
    if (isErr(review)) {
      return review;
    }
    return ok(
      review.value
        ? {
            id: review.value.id,
            url: review.value.url,
            state: review.value.state,
            fingerprint: review.value.fingerprint,
            closedBySync: review.value.closedBySync,
          }
        : null,
    );
  }

  async function upsertReview(options: {
    sourceBranch: string;
    targetBranch: string;
    title: string;
    description: string;
    fingerprint: string;
  }): Promise<Result<ContentSyncReview, ContentSyncProviderError>> {
    const description = `${options.description}\n\n${fingerprintLine(options.fingerprint)}`;
    const current = await findPicked(options.sourceBranch, options.targetBranch, true);
    if (isErr(current)) {
      return current;
    }
    // The title is sent back as it stands, so a reviewer's rename survives the next run.
    const result = current.value
      ? await bitbucketJson({
          ...request,
          method: "PUT",
          path: `${repositoryPath}/pullrequests/${encodeURIComponent(current.value.id)}`,
          body: {
            title: current.value.title || options.title,
            description,
            ...(current.value.targetBranch !== options.targetBranch
              ? { destination: { branch: { name: options.targetBranch } } }
              : {}),
          },
        })
      : await bitbucketJson({
          ...request,
          method: "POST",
          path: `${repositoryPath}/pullrequests`,
          body: {
            title: options.title,
            description,
            source: { branch: { name: options.sourceBranch } },
            destination: { branch: { name: options.targetBranch } },
            close_source_branch: true,
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
          message: "Bitbucket answered the pull request without its id or address.",
        });
  }

  async function closeReview(options: {
    id: string;
    reason: string;
  }): Promise<Result<void, ContentSyncProviderError>> {
    // Bitbucket's decline takes no message, so the reason and the mark go into the description
    // first; what it said before, a reviewer's notes included, stays underneath.
    const current = await getReview(options.id);
    if (isErr(current)) {
      return current;
    }
    const previous = current.value.description.replace(FINGERPRINT_MARK, "").trim();
    const updated = await bitbucketJson({
      ...request,
      method: "PUT",
      path: `${repositoryPath}/pullrequests/${encodeURIComponent(options.id)}`,
      body: {
        title: current.value.title,
        description: [`${options.reason}\n\n${CLOSED_MARK}`, previous]
          .filter(Boolean)
          .join("\n\n---\n\n"),
      },
    });
    if (isErr(updated)) {
      return err(writeError(updated.error, "review"));
    }
    const declined = await bitbucketJson({
      ...request,
      method: "POST",
      path: `${repositoryPath}/pullrequests/${encodeURIComponent(options.id)}/decline`,
    });
    return isErr(declined) ? err(writeError(declined.error, "review")) : ok(undefined);
  }

  return { commitFiles, upsertReview, findReview, closeReview, deleteBranch };
}
