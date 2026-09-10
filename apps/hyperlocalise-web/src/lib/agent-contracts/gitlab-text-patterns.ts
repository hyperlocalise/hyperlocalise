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
  origin: string;
  pathWithNamespace: string;
  sourceUrl: string;
};

export type GitLabMergeRequestReference = GitLabProjectReference & {
  mergeRequestIid: number;
};

const GITLAB_COM_ORIGIN = "https://gitlab.com";

const gitlabPathWithNamespacePatternSource = String.raw`(?:(?!-\/)[A-Za-z0-9_.-]+\/)+(?!-\/)[A-Za-z0-9_.-]+`;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hostFromOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    return url.host.toLowerCase();
  } catch {
    return null;
  }
}

function uniqueOrigins(origins: readonly string[]): string[] {
  const seen = new Set<string>();
  const resolved: string[] = [];
  for (const origin of origins) {
    try {
      const normalized = new URL(origin).origin;
      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      resolved.push(normalized);
    } catch {
      continue;
    }
  }
  return resolved;
}

function gitlabMergeRequestPatternForHost(host: string): RegExp {
  return new RegExp(
    String.raw`https?:\/\/(?:www\.)?${escapeRegExp(host)}\/(${gitlabPathWithNamespacePatternSource})\/-\/merge_requests\/(\d+)(?=[/?#\s>|)\].,;:!?]|$)`,
    "gi",
  );
}

function gitlabProjectPatternForHost(host: string): RegExp {
  return new RegExp(
    String.raw`https?:\/\/(?:www\.)?${escapeRegExp(host)}\/(${gitlabPathWithNamespacePatternSource})(?=\/-\/|[/?#\s>|)\].,;:!?]|$)`,
    "gi",
  );
}

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

export function extractGitLabMergeRequestReferences(
  text: string,
  allowedOrigins: readonly string[] = [GITLAB_COM_ORIGIN],
): GitLabMergeRequestReference[] {
  const references = new Map<string, GitLabMergeRequestReference>();

  for (const origin of uniqueOrigins(allowedOrigins)) {
    const host = hostFromOrigin(origin);
    if (!host) {
      continue;
    }

    for (const match of text.matchAll(gitlabMergeRequestPatternForHost(host))) {
      const pathWithNamespace = normalizeGitLabPath(match[1] ?? "");
      const mergeRequestIid = Number.parseInt(match[2] ?? "", 10);
      if (!pathWithNamespace || !Number.isSafeInteger(mergeRequestIid)) {
        continue;
      }

      references.set(
        `${origin.toLowerCase()}:${pathWithNamespace.toLowerCase()}!${mergeRequestIid}`,
        {
          origin,
          pathWithNamespace,
          mergeRequestIid,
          sourceUrl: match[0],
        },
      );
    }
  }

  return [...references.values()];
}

export function extractGitLabProjectPathReferences(
  text: string,
  allowedOrigins: readonly string[] = [GITLAB_COM_ORIGIN],
): string[] {
  return extractGitLabProjectReferences(text, allowedOrigins).map(
    (reference) => reference.pathWithNamespace,
  );
}

export function extractGitLabProjectReferences(
  text: string,
  allowedOrigins: readonly string[] = [GITLAB_COM_ORIGIN],
): GitLabProjectReference[] {
  const references = new Map<string, GitLabProjectReference>();

  for (const origin of uniqueOrigins(allowedOrigins)) {
    const host = hostFromOrigin(origin);
    if (!host) {
      continue;
    }

    for (const match of text.matchAll(gitlabProjectPatternForHost(host))) {
      const pathWithNamespace = normalizeGitLabPath(match[1] ?? "");
      if (!pathWithNamespace) {
        continue;
      }
      references.set(`${origin.toLowerCase()}:${pathWithNamespace.toLowerCase()}`, {
        origin,
        pathWithNamespace,
        sourceUrl: match[0],
      });
    }
  }

  return [...references.values()];
}

export function normalizeGitLabPathWithNamespace(value: string): string | null {
  return normalizeGitLabPath(value);
}
