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
import { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import {
  extractMentionIdsFromMarkdown,
  MarkdownEditor,
  MarkdownPreview,
  type MarkdownMentionConfig,
} from "@/components/markdown-editor/markdown-editor";
import { markdownEditorMessages } from "@/components/markdown-editor/markdown-editor.messages";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { formatRelativeTimestamp } from "../workspace-files-shared";
import { IssueCommentComposer } from "./issue-comment-composer";
import { issueCommentMessages as messages } from "./issue-comment.messages";
import {
  useIssueCommentMutations,
  useIssueCommentsQuery,
  type IssueComment,
} from "./use-issue-comments";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function IssueCommentItem({
  comment,
  organizationSlug,
  projectId,
  issueId,
  mentionConfig,
  onReply,
}: {
  comment: IssueComment;
  organizationSlug: string;
  projectId: string;
  issueId: string;
  mentionConfig: MarkdownMentionConfig;
  onReply: (comment: IssueComment) => void;
}) {
  const intl = useIntl();
  const { updateComment, deleteComment } = useIssueCommentMutations({
    organizationSlug,
    projectId,
    issueId,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const authorName = comment.author?.displayName ?? intl.formatMessage(messages.unknownAuthor);

  const saveEdit = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }
    const mentions = extractMentionIdsFromMarkdown(trimmed);
    await updateComment.mutateAsync({
      commentId: comment.id,
      body: trimmed,
      mentionedUserIds: mentions.mentionedUserIds,
      mentionedIssueIds: mentions.mentionedIssueIds,
    });
    setIsEditing(false);
    toast.success(intl.formatMessage(messages.updated));
  };

  return (
    <article
      className="group grid gap-2"
      style={{ marginInlineStart: Math.min(comment.depth, 6) * 16 }}
    >
      <div className="flex items-start gap-2.5">
        <Avatar size="sm" className="mt-0.5 size-7">
          {comment.author?.avatarUrl ? <AvatarImage src={comment.author.avatarUrl} alt="" /> : null}
          <AvatarFallback className="text-[10px]">{initials(authorName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium text-foreground">{authorName}</span>
            <span className="text-xs text-muted-foreground">
              {formatRelativeTimestamp(comment.createdAt)}
            </span>
          </div>

          {isEditing ? (
            <div className="mt-2 grid gap-2">
              <MarkdownEditor
                value={draft}
                onChange={setDraft}
                chrome="minimal"
                mentionConfig={mentionConfig}
                disabled={updateComment.isPending}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void saveEdit()}
                  disabled={updateComment.isPending || !draft.trim()}
                >
                  <FormattedMessage {...messages.save} />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(comment.body);
                    setIsEditing(false);
                  }}
                  disabled={updateComment.isPending}
                >
                  <FormattedMessage {...messages.cancel} />
                </Button>
              </div>
            </div>
          ) : (
            <MarkdownPreview value={comment.body} chrome="minimal" className="mt-1" />
          )}

          {!isEditing ? (
            <div className="mt-1 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onReply(comment)}
              >
                <FormattedMessage {...messages.reply} />
              </Button>
              {comment.canEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setDraft(comment.body);
                    setIsEditing(true);
                  }}
                >
                  <FormattedMessage {...messages.edit} />
                </Button>
              ) : null}
              {comment.canDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-destructive"
                  disabled={deleteComment.isPending}
                  onClick={() => {
                    void deleteComment.mutateAsync(comment.id).then(() => {
                      toast.success(intl.formatMessage(messages.deleted));
                    });
                  }}
                >
                  <FormattedMessage {...messages.delete} />
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function IssueCommentThread({
  organizationSlug,
  projectId,
  issueId,
}: {
  organizationSlug: string;
  projectId: string;
  issueId: string;
}) {
  const intl = useIntl();
  const commentsQuery = useIssueCommentsQuery({ organizationSlug, projectId, issueId });
  const { createComment } = useIssueCommentMutations({
    organizationSlug,
    projectId,
    issueId,
  });
  const [replyTo, setReplyTo] = useState<IssueComment | null>(null);

  const mentionConfig: MarkdownMentionConfig = {
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
  };

  return (
    <section className="mt-2 grid gap-4 border-t border-border pt-4">
      <TypographyP className="text-sm font-medium text-foreground">
        <FormattedMessage {...messages.sectionTitle} />
      </TypographyP>

      {commentsQuery.isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {commentsQuery.isError ? (
        <TypographyP className="text-sm text-muted-foreground">
          <FormattedMessage {...messages.loadError} />
        </TypographyP>
      ) : null}

      {commentsQuery.data && commentsQuery.data.issueComments.length === 0 ? (
        <TypographyP className="text-sm text-muted-foreground">
          <FormattedMessage {...messages.empty} />
        </TypographyP>
      ) : null}

      {commentsQuery.data && commentsQuery.data.issueComments.length > 0 ? (
        <div className="grid gap-4">
          {commentsQuery.data.issueComments.map((comment) => (
            <IssueCommentItem
              key={comment.id}
              comment={comment}
              organizationSlug={organizationSlug}
              projectId={projectId}
              issueId={issueId}
              mentionConfig={mentionConfig}
              onReply={setReplyTo}
            />
          ))}
        </div>
      ) : null}

      <div className={cn("grid gap-2")}>
        {replyTo ? (
          <TypographyP className="text-xs text-muted-foreground">
            <FormattedMessage
              {...messages.replyPlaceholder}
              values={{ name: replyTo.author?.displayName ?? "…" }}
            />
          </TypographyP>
        ) : null}
        <IssueCommentComposer
          organizationSlug={organizationSlug}
          projectId={projectId}
          issueId={issueId}
          parentId={replyTo?.id ?? null}
          replyToName={replyTo?.author?.displayName ?? null}
          disabled={createComment.isPending}
          onCancel={replyTo ? () => setReplyTo(null) : undefined}
          onSubmit={async (input) => {
            await createComment.mutateAsync(input);
            setReplyTo(null);
            toast.success(intl.formatMessage(messages.posted));
          }}
        />
      </div>
    </section>
  );
}
