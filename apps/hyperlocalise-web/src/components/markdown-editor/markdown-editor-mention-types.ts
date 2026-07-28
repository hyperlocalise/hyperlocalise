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

export function mentionHrefForUser(userId: string) {
  return `mention:user:${userId}`;
}

export function mentionHrefForIssue(issueId: string) {
  return `mention:issue:${issueId}`;
}

export function parseMentionHref(href: string): {
  kind: "user" | "issue";
  id: string;
} | null {
  const match = /^mention:(user|issue):(.+)$/.exec(href);
  if (!match) {
    return null;
  }
  return { kind: match[1] as "user" | "issue", id: match[2]! };
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
