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

export type GitLabProjectReference = {
  pathWithNamespace: string;
  sourceUrl: string;
};

export type GitLabMergeRequestReference = GitLabProjectReference & {
  mergeRequestIid: number;
};

export const gitlabMergeRequestUrlPatternSource = String.raw`https?:\/\/(?:www\.)?gitlab\.com\/((?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+)\/-\/merge_requests\/(\d+)(?=[/?#\s>|)\].,;:!?]|$)`;

const gitlabMergeRequestUrlPattern = new RegExp(gitlabMergeRequestUrlPatternSource, "gi");
const gitlabProjectUrlPattern =
  /https?:\/\/(?:www\.)?gitlab\.com\/((?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+)(?=\/-\/|[/?#\s>|)\].,;:!?]|$)/gi;

function trimTrailingPunctuation(value: string) {
  return value.replace(/[.,;:!?]+$/g, "");
}

function normalizeGitLabPath(value: string): string | null {
  const trimmed = trimTrailingPunctuation(value.trim()).replace(/\.git$/i, "");
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  if (parts.some((part) => /\s/.test(part))) {
    return null;
  }

  return parts.join("/");
}

export function extractGitLabMergeRequestReferences(text: string): GitLabMergeRequestReference[] {
  const references = new Map<string, GitLabMergeRequestReference>();

  for (const match of text.matchAll(gitlabMergeRequestUrlPattern)) {
    const pathWithNamespace = normalizeGitLabPath(match[1] ?? "");
    const mergeRequestIid = Number.parseInt(match[2] ?? "", 10);
    if (!pathWithNamespace || !Number.isSafeInteger(mergeRequestIid)) {
      continue;
    }

    references.set(`${pathWithNamespace.toLowerCase()}!${mergeRequestIid}`, {
      pathWithNamespace,
      mergeRequestIid,
      sourceUrl: match[0],
    });
  }

  return [...references.values()];
}

export function extractGitLabProjectPathReferences(text: string): string[] {
  const references = new Map<string, string>();

  for (const match of text.matchAll(gitlabProjectUrlPattern)) {
    const pathWithNamespace = normalizeGitLabPath(match[1] ?? "");
    if (!pathWithNamespace) {
      continue;
    }
    references.set(pathWithNamespace.toLowerCase(), pathWithNamespace);
  }

  return [...references.values()];
}

export function normalizeGitLabPathWithNamespace(value: string): string | null {
  return normalizeGitLabPath(value);
}
