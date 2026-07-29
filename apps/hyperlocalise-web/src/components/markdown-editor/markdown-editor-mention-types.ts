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

export type MarkdownMentionUserSuggestion = {
  kind: "user";
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isAgent?: boolean;
};

export type MarkdownMentionIssueSuggestion = {
  kind: "issue";
  id: string;
  issueId: string;
  projectId: string;
  displayKey: string;
  title: string;
  status: string;
};

export type MarkdownMentionSuggestion =
  | MarkdownMentionUserSuggestion
  | MarkdownMentionIssueSuggestion;

export type MarkdownMentionSearchResult = {
  users: MarkdownMentionUserSuggestion[];
  issues: MarkdownMentionIssueSuggestion[];
};

export type MarkdownMentionConfig = {
  search: (query: string) => Promise<MarkdownMentionSearchResult> | MarkdownMentionSearchResult;
  emptyLabel: string;
  usersSectionLabel: string;
  issuesSectionLabel: string;
};

export type ParsedMarkdownMention =
  | { kind: "user"; id: string }
  | { kind: "issue"; id: string; projectId: string };

export function mentionHrefForUser(userId: string) {
  return `mention:user:${userId}`;
}

export function mentionHrefForIssue(issueId: string, projectId: string) {
  return `mention:issue:${issueId}:${encodeURIComponent(projectId)}`;
}

function tryDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function parseMentionHref(href: string): ParsedMarkdownMention | null {
  const userMatch = /^mention:user:(.+)$/.exec(href);
  if (userMatch?.[1]) {
    return { kind: "user", id: userMatch[1] };
  }

  const issueMatch = /^mention:issue:([^:]+):(.+)$/.exec(href);
  if (issueMatch?.[1] && issueMatch[2]) {
    const projectId = tryDecodeURIComponent(issueMatch[2]);
    if (!projectId) {
      return null;
    }
    return {
      kind: "issue",
      id: issueMatch[1],
      projectId,
    };
  }

  return null;
}

export function extractMentionIdsFromMarkdown(markdown: string): {
  mentionedUserIds: string[];
  mentionedIssueIds: string[];
} {
  const mentionedUserIds: string[] = [];
  const mentionedIssueIds: string[] = [];
  const pattern = /mention:(user|issue):([0-9a-fA-F-]{36})/g;
  for (const match of markdown.matchAll(pattern)) {
    const kind = match[1];
    const id = match[2]!;
    if (kind === "user") {
      mentionedUserIds.push(id);
    } else {
      mentionedIssueIds.push(id);
    }
  }
  return {
    mentionedUserIds: [...new Set(mentionedUserIds)],
    mentionedIssueIds: [...new Set(mentionedIssueIds)],
  };
}
