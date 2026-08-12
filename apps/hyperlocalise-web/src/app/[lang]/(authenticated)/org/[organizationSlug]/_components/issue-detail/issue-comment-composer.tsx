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
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { SentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  extractMentionIdsFromMarkdown,
  MarkdownEditor,
  type MarkdownMentionConfig,
  type ParsedMarkdownMention,
} from "@/components/markdown-editor/markdown-editor";
import { markdownEditorMessages } from "@/components/markdown-editor/markdown-editor.messages";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import { issueCommentMessages as messages } from "./issue-comment.messages";
import { useIssueDetailGuardedNavigate } from "./issue-detail-navigation-guard";
import { buildIssueDetailHref } from "./issue-detail-utils";

type IssueCommentComposerProps = {
  organizationSlug: string;
  projectId: string;
  issueId: string;
  parentId?: string | null;
  replyToName?: string | null;
  disabled?: boolean;
  /** Compact footer row inside a root comment card (Linear-style). */
  variant?: "card" | "inline";
  onCancel?: () => void;
  onSubmit: (input: {
    body: string;
    parentId?: string;
    mentionedUserIds: string[];
    mentionedIssueIds: string[];
  }) => Promise<void> | void;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function IssueCommentComposer({
  organizationSlug,
  projectId,
  issueId,
  parentId = null,
  replyToName = null,
  disabled = false,
  variant = "card",
  onCancel,
  onSubmit,
}: IssueCommentComposerProps) {
  const intl = useIntl();
  const { user } = useAuth();
  const navigateGuarded = useIssueDetailGuardedNavigate();
  const [value, setValue] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.email ||
    intl.formatMessage(messages.unknownAuthor);

  const handleMentionNavigate = useCallback(
    (mention: ParsedMarkdownMention) => {
      if (mention.kind === "issue") {
        navigateGuarded(
          buildIssueDetailHref({
            organizationSlug,
            projectId: mention.projectId,
            issueId: mention.id,
          }),
        );
        return;
      }
      navigateGuarded(`/org/${encodeURIComponent(organizationSlug)}/members`);
    },
    [navigateGuarded, organizationSlug],
  );

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
          users: body.mentionSuggestions.users.map((entry) => ({
            kind: "user" as const,
            id: `user:${entry.userId}`,
            userId: entry.userId,
            displayName: entry.displayName,
            avatarUrl: entry.avatarUrl,
            isAgent: entry.isAgent,
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
      setEditorKey((key) => key + 1);
    } finally {
      setIsSubmitting(false);
    }
  }, [disabled, isSubmitting, onSubmit, parentId, value]);

  const placeholder = replyToName
    ? intl.formatMessage(messages.replyPlaceholder, { name: replyToName })
    : variant === "inline"
      ? intl.formatMessage(messages.leaveReplyPlaceholder)
      : intl.formatMessage(messages.leaveCommentPlaceholder);

  const canSubmit = !disabled && !isSubmitting && Boolean(value.trim());

  if (variant === "inline") {
    return (
      <div className={cn("flex items-start gap-2", disabled && "opacity-60")}>
        <Avatar size="sm" className="mt-0.5 size-6">
          {user?.profilePictureUrl ? <AvatarImage src={user.profilePictureUrl} alt="" /> : null}
          <AvatarFallback className="text-[10px]">{initials(displayName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <MarkdownEditor
            key={editorKey}
            value={value}
            onChange={setValue}
            disabled={disabled || isSubmitting}
            chrome="minimal"
            compact
            mentionConfig={mentionConfig}
            onMentionNavigate={handleMentionNavigate}
            imageUpload={{ organizationSlug, projectId }}
            placeholder={placeholder}
            className="min-h-6 border-0 bg-transparent p-0 shadow-none"
          />
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {onCancel ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              <FormattedMessage {...messages.cancel} />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            className="size-7 rounded-full text-muted-foreground disabled:opacity-40"
            disabled={!canSubmit}
            aria-label={intl.formatMessage(messages.send)}
            onClick={() => void handleSubmit()}
          >
            <HugeiconsIcon icon={SentIcon} strokeWidth={1.8} className="size-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card shadow-xs",
        disabled && "opacity-60",
      )}
    >
      <div className="px-3.5 pt-3 pb-1.5">
        <MarkdownEditor
          key={editorKey}
          value={value}
          onChange={setValue}
          disabled={disabled || isSubmitting}
          chrome="minimal"
          mentionConfig={mentionConfig}
          onMentionNavigate={handleMentionNavigate}
          imageUpload={{ organizationSlug, projectId }}
          placeholder={placeholder}
          className="min-h-14 border-0 bg-transparent p-0 shadow-none"
        />
      </div>
      <div className="flex items-center justify-end gap-1 px-2.5 pb-2.5">
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mr-auto h-7 px-2 text-xs"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            <FormattedMessage {...messages.cancel} />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className="size-7 rounded-full text-muted-foreground disabled:opacity-40"
          disabled={!canSubmit}
          aria-label={intl.formatMessage(messages.send)}
          onClick={() => void handleSubmit()}
        >
          <HugeiconsIcon icon={SentIcon} strokeWidth={1.8} className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
