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
import { useState, type ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";
import { Delete02Icon, Edit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  extractMentionIdsFromMarkdown,
  MarkdownEditor,
  MarkdownPreview,
  type MarkdownMentionConfig,
  type ParsedMarkdownMention,
} from "@/components/markdown-editor/markdown-editor";
import { markdownEditorMessages } from "@/components/markdown-editor/markdown-editor.messages";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { formatRelativeTimestamp } from "../workspace-files-shared";
import { IssueCommentComposer } from "./issue-comment-composer";
import { issueCommentMessages as messages } from "./issue-comment.messages";
import { useIssueDetailGuardedNavigate } from "./issue-detail-navigation-guard";
import { buildIssueDetailHref, issueStatusLabel } from "./issue-detail-utils";
import { useIssueCommentMutations, type IssueComment } from "./use-issue-comments";
import { useIssueFeedQuery } from "./use-issue-feed";
import type { IssueActivity } from "./use-issue-activities";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function IssueCommentBody({
  comment,
  mentionConfig,
  organizationSlug,
  projectId,
  issueId,
  indent = 0,
}: {
  comment: IssueComment;
  mentionConfig: MarkdownMentionConfig;
  organizationSlug: string;
  projectId: string;
  issueId: string;
  indent?: number;
}) {
  const intl = useIntl();
  const navigateGuarded = useIssueDetailGuardedNavigate();
  const { updateComment, deleteComment } = useIssueCommentMutations({
    organizationSlug,
    projectId,
    issueId,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
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

  const confirmDelete = async () => {
    await deleteComment.mutateAsync(comment.id);
    setIsDeleteOpen(false);
    toast.success(intl.formatMessage(messages.deleted));
  };

  const handleMentionNavigate = (mention: ParsedMarkdownMention) => {
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
  };

  return (
    <div className="flex items-start gap-2" style={{ marginInlineStart: indent * 12 }}>
      <Avatar size="sm" className="mt-0.5 size-6">
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
          <div className="mt-1.5 grid gap-1.5">
            <MarkdownEditor
              value={draft}
              onChange={setDraft}
              chrome="minimal"
              compact
              mentionConfig={mentionConfig}
              onMentionNavigate={handleMentionNavigate}
              placeholder={intl.formatMessage(messages.editPlaceholder)}
              disabled={updateComment.isPending}
            />
            <div className="flex gap-1.5">
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
          <MarkdownPreview
            value={comment.body}
            chrome="minimal"
            className="mt-0.5 text-sm"
            onMentionNavigate={handleMentionNavigate}
          />
        )}

        {!isEditing && (comment.canEdit || comment.canDelete) ? (
          <div className="mt-1 flex items-center gap-0.5">
            {comment.canEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-7 text-muted-foreground hover:text-foreground"
                aria-label={intl.formatMessage(messages.edit)}
                onClick={() => {
                  setDraft(comment.body);
                  setIsEditing(true);
                }}
              >
                <HugeiconsIcon icon={Edit02Icon} strokeWidth={1.8} className="size-3.5" />
              </Button>
            ) : null}
            {comment.canDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-7 text-muted-foreground hover:text-destructive"
                aria-label={intl.formatMessage(messages.delete)}
                disabled={deleteComment.isPending}
                onClick={() => setIsDeleteOpen(true)}
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} className="size-3.5" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <AlertDialog
        open={isDeleteOpen}
        onOpenChange={(open) => {
          if (deleteComment.isPending) {
            return;
          }
          setIsDeleteOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage {...messages.deleteConfirmTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <FormattedMessage {...messages.deleteConfirmDescription} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteComment.isPending}>
              <FormattedMessage {...messages.cancel} />
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteComment.isPending}
              onClick={() => void confirmDelete()}
            >
              <FormattedMessage {...messages.deleteConfirmAction} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function IssueCommentThreadCard({
  root,
  replies,
  organizationSlug,
  projectId,
  issueId,
  mentionConfig,
  onReply,
}: {
  root: IssueComment;
  replies: IssueComment[];
  organizationSlug: string;
  projectId: string;
  issueId: string;
  mentionConfig: MarkdownMentionConfig;
  onReply: (input: {
    body: string;
    parentId?: string;
    mentionedUserIds: string[];
    mentionedIssueIds: string[];
  }) => Promise<void>;
}) {
  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
      <div className="grid gap-2.5 p-3">
        <IssueCommentBody
          comment={root}
          mentionConfig={mentionConfig}
          organizationSlug={organizationSlug}
          projectId={projectId}
          issueId={issueId}
        />
        {replies.map((reply) => (
          <IssueCommentBody
            key={reply.id}
            comment={reply}
            mentionConfig={mentionConfig}
            organizationSlug={organizationSlug}
            projectId={projectId}
            issueId={issueId}
            indent={Math.min(reply.depth, 4)}
          />
        ))}
      </div>
      <div className="border-t border-border px-3 py-2">
        <IssueCommentComposer
          organizationSlug={organizationSlug}
          projectId={projectId}
          issueId={issueId}
          parentId={root.id}
          variant="inline"
          onSubmit={onReply}
        />
      </div>
    </article>
  );
}

function activityName(name: string) {
  return <span className="font-medium text-foreground">{name}</span>;
}

function IssueFeedActivityRow({
  actorName,
  actorAvatar,
  createdAt,
  connectAbove = false,
  connectBelow = false,
  children,
}: {
  actorName: string;
  actorAvatar: string | null;
  createdAt: string;
  connectAbove?: boolean;
  connectBelow?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative flex items-center gap-3 py-2">
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-[7px] w-px bg-border",
          connectAbove ? "top-0" : "top-1",
          connectBelow ? "bottom-0" : "bottom-1",
        )}
      />
      <Avatar className="relative z-10 size-4 ring-2 ring-background after:hidden">
        {actorAvatar ? <AvatarImage src={actorAvatar} alt="" /> : null}
        <AvatarFallback className="bg-muted text-[8px] leading-none">
          {initials(actorName)}
        </AvatarFallback>
      </Avatar>
      <p className="min-w-0 flex-1 truncate text-xs leading-4 text-muted-foreground">
        {children}
        {" · "}
        {formatRelativeTimestamp(createdAt)}
      </p>
    </div>
  );
}

function IssueActivityRow({
  activity,
  connectAbove = false,
  connectBelow = false,
}: {
  activity: IssueActivity;
  connectAbove?: boolean;
  connectBelow?: boolean;
}) {
  const intl = useIntl();
  const actorName = activity.actor?.displayName ?? intl.formatMessage(messages.unknownActor);
  const actorAvatar = activity.actor?.avatarUrl ?? null;
  const actor = activityName(actorName);

  let copy: ReactNode;
  if (activity.type === "issue_created") {
    copy = <FormattedMessage {...messages.issueCreated} values={{ actor }} />;
  } else if (activity.type === "status_changed") {
    copy = (
      <FormattedMessage
        {...messages.statusChanged}
        values={{
          actor,
          previousStatus: activityName(issueStatusLabel(intl, activity.previousStatus)),
          nextStatus: activityName(issueStatusLabel(intl, activity.nextStatus)),
        }}
      />
    );
  } else if (!activity.nextAssignee) {
    copy = <FormattedMessage {...messages.unassigned} values={{ actor }} />;
  } else if (activity.actor?.userId && activity.nextAssignee.userId === activity.actor.userId) {
    copy = <FormattedMessage {...messages.assignedToSelf} values={{ actor }} />;
  } else {
    copy = (
      <FormattedMessage
        {...messages.assignedTo}
        values={{
          actor,
          assignee: activityName(activity.nextAssignee.displayName),
        }}
      />
    );
  }

  return (
    <IssueFeedActivityRow
      actorName={actorName}
      actorAvatar={actorAvatar}
      createdAt={activity.createdAt}
      connectAbove={connectAbove}
      connectBelow={connectBelow}
    >
      {copy}
    </IssueFeedActivityRow>
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
  const feedQuery = useIssueFeedQuery({ organizationSlug, projectId, issueId });
  const { createComment } = useIssueCommentMutations({
    organizationSlug,
    projectId,
    issueId,
  });

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

  const feedItems = feedQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const hasMore = Boolean(feedQuery.hasNextPage);
  const isLoading = feedQuery.isLoading;
  const isError = feedQuery.isError;
  const isEmpty = !isLoading && !isError && feedItems.length === 0;

  const handleCreate = async (input: {
    body: string;
    parentId?: string;
    mentionedUserIds: string[];
    mentionedIssueIds: string[];
  }) => {
    await createComment.mutateAsync(input);
    toast.success(intl.formatMessage(messages.posted));
  };

  return (
    <section className="mt-2 grid gap-3 border-t border-border pt-4">
      <TypographyP className="text-sm font-medium text-foreground">
        <FormattedMessage {...messages.sectionTitle} />
      </TypographyP>

      {isLoading ? (
        <div className="grid gap-2">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ) : null}

      {isError ? (
        <TypographyP className="text-sm text-muted-foreground">
          <FormattedMessage {...messages.loadError} />
        </TypographyP>
      ) : null}

      {isEmpty ? (
        <TypographyP className="text-sm text-muted-foreground">
          <FormattedMessage {...messages.empty} />
        </TypographyP>
      ) : null}

      {feedItems.length > 0 ? (
        <div className="flex flex-col gap-2">
          {feedItems.map((item, index) => {
            if (item.kind === "activity") {
              const connectAbove = feedItems[index - 1]?.kind === "activity";
              const connectBelow = feedItems[index + 1]?.kind === "activity";
              return (
                <div key={`activity:${item.activity.id}`} className={cn(connectBelow && "-mb-2")}>
                  <IssueActivityRow
                    activity={item.activity}
                    connectAbove={connectAbove}
                    connectBelow={connectBelow}
                  />
                </div>
              );
            }

            return (
              <IssueCommentThreadCard
                key={`comment:${item.root.id}`}
                root={item.root}
                replies={item.replies}
                organizationSlug={organizationSlug}
                projectId={projectId}
                issueId={issueId}
                mentionConfig={mentionConfig}
                onReply={handleCreate}
              />
            );
          })}
        </div>
      ) : null}

      {hasMore ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={feedQuery.isFetchingNextPage}
            onClick={() => {
              void feedQuery.fetchNextPage();
            }}
          >
            {feedQuery.isFetchingNextPage ? (
              <FormattedMessage {...messages.loadingMore} />
            ) : (
              <FormattedMessage {...messages.loadMore} />
            )}
          </Button>
        </div>
      ) : null}

      <IssueCommentComposer
        organizationSlug={organizationSlug}
        projectId={projectId}
        issueId={issueId}
        disabled={createComment.isPending}
        onSubmit={handleCreate}
      />
    </section>
  );
}
