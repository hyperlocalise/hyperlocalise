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

export type BitbucketPullRequestReference = {
  /** `workspace/repo-slug`. */
  repositoryFullName: string;
  pullRequestId: number;
  sourceUrl: string;
};

const segmentSource = String.raw`[A-Za-z0-9_.-]+`;

/** Bitbucket Cloud only, with or without a `user@` in front, as a clone link carries. */
const bitbucketUrlPrefixSource = String.raw`https?:\/\/(?:[^\s@\/]+@)?(?:www\.)?bitbucket\.org`;

const boundarySource = String.raw`(?=[/?#\s>|)\].,;:!?]|$)`;

/** First path segments that are Bitbucket's own pages, not a workspace. */
const RESERVED_FIRST_SEGMENTS = new Set([
  "account",
  "blog",
  "dashboard",
  "product",
  "repo",
  "site",
  "snippets",
  "socialauth",
  "support",
  "workspace",
]);

function pullRequestUrlPattern(): RegExp {
  return new RegExp(
    String.raw`${bitbucketUrlPrefixSource}\/(${segmentSource})\/(${segmentSource})\/pull-requests\/(\d+)${boundarySource}`,
    "gi",
  );
}

function repositoryUrlPattern(): RegExp {
  return new RegExp(
    String.raw`${bitbucketUrlPrefixSource}\/(${segmentSource})\/(${segmentSource})${boundarySource}`,
    "gi",
  );
}

/** A `workspace/repo-slug`, from a link's two segments or a pasted value; null when it isn't one. */
export function normalizeBitbucketRepositoryFullName(value: string): string | null {
  const trimmed = value
    .trim()
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\.git$/i, "");
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length !== 2) {
    return null;
  }
  const [workspace = "", slug = ""] = parts;
  if (!/^[A-Za-z0-9_.-]+$/.test(workspace) || !/^[A-Za-z0-9_.-]+$/.test(slug)) {
    return null;
  }
  if (RESERVED_FIRST_SEGMENTS.has(workspace.toLowerCase())) {
    return null;
  }
  return `${workspace}/${slug}`;
}

export function extractBitbucketPullRequestReferences(
  text: string,
): BitbucketPullRequestReference[] {
  const references = new Map<string, BitbucketPullRequestReference>();

  for (const match of text.matchAll(pullRequestUrlPattern())) {
    const repositoryFullName = normalizeBitbucketRepositoryFullName(
      `${match[1] ?? ""}/${match[2] ?? ""}`,
    );
    const pullRequestId = Number.parseInt(match[3] ?? "", 10);
    if (!repositoryFullName || !Number.isSafeInteger(pullRequestId)) {
      continue;
    }
    references.set(`${repositoryFullName.toLowerCase()}#${pullRequestId}`, {
      repositoryFullName,
      pullRequestId,
      sourceUrl: match[0],
    });
  }

  return [...references.values()];
}

export function extractBitbucketRepositoryReferences(text: string): string[] {
  const references = new Map<string, string>();

  for (const match of text.matchAll(repositoryUrlPattern())) {
    const repositoryFullName = normalizeBitbucketRepositoryFullName(
      `${match[1] ?? ""}/${match[2] ?? ""}`,
    );
    if (!repositoryFullName) {
      continue;
    }
    references.set(repositoryFullName.toLowerCase(), repositoryFullName);
  }

  return [...references.values()];
}
