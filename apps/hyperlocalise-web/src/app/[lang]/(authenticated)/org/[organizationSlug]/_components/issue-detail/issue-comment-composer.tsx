"use client";

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
import { useCallback, useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { ArrowUp01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  extractMentionIdsFromMarkdown,
  MarkdownEditor,
  type MarkdownMentionConfig,
} from "@/components/markdown-editor/markdown-editor";
import { markdownEditorMessages } from "@/components/markdown-editor/markdown-editor.messages";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import { issueCommentMessages as messages } from "./issue-comment.messages";

type IssueCommentComposerProps = {
  organizationSlug: string;
  projectId: string;
  issueId: string;
  parentId?: string | null;
  replyToName?: string | null;
  disabled?: boolean;
  onCancel?: () => void;
  onSubmit: (input: {
    body: string;
    parentId?: string;
    mentionedUserIds: string[];
    mentionedIssueIds: string[];
  }) => Promise<void> | void;
};

export function IssueCommentComposer({
  organizationSlug,
  projectId,
  issueId,
  parentId = null,
  replyToName = null,
  disabled = false,
  onCancel,
  onSubmit,
}: IssueCommentComposerProps) {
  const intl = useIntl();
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mentionConfig = useMemo<MarkdownMentionConfig>(
    () => ({
      emptyLabel: intl.formatMessage(markdownEditorMessages.mentionEmpty),
      usersSectionLabel: intl.formatMessage(markdownEditorMessages.mentionUsersSection),
      issuesSectionLabel: intl.formatMessage(markdownEditorMessages.mentionIssuesSection),
      search: async (query) => {
        const params = new URLSearchParams({
          q: query,
          projectId,
          issueId,
          limit: "5",
        });
        const response = await fetch(
          `/api/orgs/${encodeURIComponent(organizationSlug)}/mentions?${params.toString()}`,
        );
        if (!response.ok) {
          return { users: [], issues: [] };
        }
        const body = (await response.json()) as {
          mentionSuggestions: {
            users: {
              userId: string;
              displayName: string;
              avatarUrl: string | null;
              isAgent?: boolean;
            }[];
            issues: {
              issueId: string;
              projectId: string;
              displayKey: string;
              title: string;
              status: string;
            }[];
          };
        };
        return {
          users: body.mentionSuggestions.users.map((user) => ({
            kind: "user" as const,
            id: `user:${user.userId}`,
            userId: user.userId,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            isAgent: user.isAgent,
          })),
          issues: body.mentionSuggestions.issues.map((issue) => ({
            kind: "issue" as const,
            id: `issue:${issue.issueId}`,
            issueId: issue.issueId,
            projectId: issue.projectId,
            displayKey: issue.displayKey,
            title: issue.title,
            status: issue.status,
          })),
        };
      },
    }),
    [intl, issueId, organizationSlug, projectId],
  );

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || isSubmitting || disabled) {
      return;
    }
    setIsSubmitting(true);
    try {
      const mentions = extractMentionIdsFromMarkdown(trimmed);
      await onSubmit({
        body: trimmed,
        parentId: parentId ?? undefined,
        mentionedUserIds: mentions.mentionedUserIds,
        mentionedIssueIds: mentions.mentionedIssueIds,
      });
      setValue("");
    } finally {
      setIsSubmitting(false);
    }
  }, [disabled, isSubmitting, onSubmit, parentId, value]);

  return (
    <div
      className={cn("rounded-xl border border-border bg-muted/40 p-2", disabled && "opacity-60")}
    >
      <MarkdownEditor
        value={value}
        onChange={setValue}
        disabled={disabled || isSubmitting}
        chrome="minimal"
        mentionConfig={mentionConfig}
        placeholder={
          replyToName
            ? intl.formatMessage(messages.replyPlaceholder, { name: replyToName })
            : intl.formatMessage(markdownEditorMessages.commentPlaceholder)
        }
        className="min-h-[4rem]"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            <FormattedMessage {...messages.cancel} />
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={disabled || isSubmitting || !value.trim()}
          onClick={() => void handleSubmit()}
        >
          <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={1.8} className="size-3.5" />
          <FormattedMessage {...messages.send} />
        </Button>
      </div>
    </div>
  );
}
