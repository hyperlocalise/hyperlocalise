"use client";

import { useState } from "react";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { isOpenIssueStatus } from "@/components/cat/queue/cat-queue-filter";
import { catEditorPanelMessages } from "@/components/cat/shared/cat.messages";
import type {
  CatSegment,
  CatSegmentComment,
  CatSegmentCommentInput,
  CatSegmentCommentType,
  CrowdinIssueType,
} from "@/components/cat/shared/types";

function formatCommentTimestamp(intl: IntlShape, createdAt: string) {
  const parsed = Date.parse(createdAt);
  if (Number.isNaN(parsed)) {
    return createdAt;
  }

  return intl.formatDate(parsed, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const crowdinIssueTypeOptions: Array<{
  value: CrowdinIssueType;
  message: (typeof catEditorPanelMessages)[keyof typeof catEditorPanelMessages];
}> = [
  { value: "general_question", message: catEditorPanelMessages.issueTypeGeneralQuestion },
  { value: "translation_mistake", message: catEditorPanelMessages.issueTypeTranslationMistake },
  { value: "context_request", message: catEditorPanelMessages.issueTypeContextRequest },
  { value: "source_mistake", message: catEditorPanelMessages.issueTypeSourceMistake },
];

function CatEditorCommentItem({
  comment,
  intl,
  isResolvingComment,
  isPostingComment,
  resolvingCommentId,
  onResolveComment,
}: {
  comment: CatSegmentComment;
  intl: IntlShape;
  isResolvingComment: boolean;
  isPostingComment: boolean;
  resolvingCommentId: string | null;
  onResolveComment?: (commentId: string) => void | Promise<void>;
}) {
  return (
    <li className="space-y-1 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {comment.type === "issue" ? (
          <Badge variant="outline" className="border-flame-200/40 text-flame-100">
            <FormattedMessage {...catEditorPanelMessages.commentIssueLabel} />
          </Badge>
        ) : null}
        {comment.author ? (
          <span className="font-medium text-subtle-foreground">{comment.author}</span>
        ) : null}
        {comment.createdAt ? <span>{formatCommentTimestamp(intl, comment.createdAt)}</span> : null}
        {comment.status ? <span className="capitalize">{comment.status}</span> : null}
      </div>
      <p className="text-sm leading-relaxed text-foreground">{comment.text}</p>
      {comment.type === "issue" && isOpenIssueStatus(comment.status) && onResolveComment ? (
        <div className="flex justify-end pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void onResolveComment(comment.id)}
            disabled={
              isResolvingComment ||
              isPostingComment ||
              (resolvingCommentId !== null && resolvingCommentId !== comment.id)
            }
          >
            {isResolvingComment && resolvingCommentId === comment.id ? (
              <Spinner className="size-4" />
            ) : null}
            {isResolvingComment && resolvingCommentId === comment.id ? (
              <FormattedMessage {...catEditorPanelMessages.resolvingIssue} />
            ) : (
              <FormattedMessage {...catEditorPanelMessages.resolveIssue} />
            )}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function CatEditorCommentsList({
  comments,
  isLoading,
  intl,
  isResolvingComment,
  isPostingComment,
  resolvingCommentId,
  onResolveComment,
}: {
  comments: CatSegmentComment[];
  isLoading: boolean;
  intl: IntlShape;
  isResolvingComment: boolean;
  isPostingComment: boolean;
  resolvingCommentId: string | null;
  onResolveComment?: (commentId: string) => void | Promise<void>;
}) {
  if (isLoading) {
    return (
      <ul className="space-y-3" aria-busy="true">
        {Array.from({ length: 2 }, (_, index) => (
          <li
            key={`comment-skeleton-${index}`}
            className="space-y-2 rounded-lg border border-border p-3"
          >
            <Skeleton className="h-3 w-24 rounded-full bg-skeleton" />
            <Skeleton className="h-4 w-full rounded-full bg-skeleton" />
            <Skeleton className="h-3 w-32 rounded-full bg-skeleton" />
          </li>
        ))}
      </ul>
    );
  }

  if (comments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        <FormattedMessage {...catEditorPanelMessages.noComments} />
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {comments.map((comment) => (
        <CatEditorCommentItem
          key={comment.id}
          comment={comment}
          intl={intl}
          isResolvingComment={isResolvingComment}
          isPostingComment={isPostingComment}
          resolvingCommentId={resolvingCommentId}
          onResolveComment={onResolveComment}
        />
      ))}
    </ul>
  );
}

export function CatEditorCommentsSection({
  segment,
  isLoading,
  canAddComment,
  supportsIssueComments,
  isPostingComment,
  isResolvingComment,
  resolvingCommentId,
  commentPostError,
  onAddComment,
  onResolveComment,
}: {
  segment: CatSegment;
  isLoading: boolean;
  canAddComment: boolean;
  supportsIssueComments: boolean;
  isPostingComment: boolean;
  isResolvingComment: boolean;
  resolvingCommentId: string | null;
  commentPostError?: string;
  onAddComment?: (input: CatSegmentCommentInput) => void | Promise<void>;
  onResolveComment?: (commentId: string) => void | Promise<void>;
}) {
  const intl = useIntl();
  const segmentComments = segment.comments ?? [];
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentInputTypes, setCommentInputTypes] = useState<Record<string, CatSegmentCommentType>>(
    {},
  );
  const [issueTypes, setIssueTypes] = useState<Record<string, CrowdinIssueType>>({});

  const commentDraft = commentDrafts[segment.id] ?? "";
  const commentInputType = commentInputTypes[segment.id] ?? "comment";
  const issueType = issueTypes[segment.id] ?? "general_question";
  const trimmedCommentDraft = commentDraft.trim();

  function handleCommentDraftChange(value: string) {
    setCommentDrafts((current) => ({ ...current, [segment.id]: value }));
  }

  async function handleAddComment() {
    if (!trimmedCommentDraft || !onAddComment || isPostingComment) {
      return;
    }

    const input: CatSegmentCommentInput = {
      text: trimmedCommentDraft,
      ...(supportsIssueComments && commentInputType === "issue"
        ? { type: "issue" as const, issueType }
        : {}),
    };

    await onAddComment(input);
    handleCommentDraftChange("");
  }

  function handleCommentInputTypeChange(value: string) {
    if (value !== "comment" && value !== "issue") {
      return;
    }

    setCommentInputTypes((current) => ({ ...current, [segment.id]: value }));
  }

  function handleIssueTypeChange(value: CrowdinIssueType | null) {
    if (
      value !== "general_question" &&
      value !== "translation_mistake" &&
      value !== "context_request" &&
      value !== "source_mistake"
    ) {
      return;
    }

    setIssueTypes((current) => ({ ...current, [segment.id]: value }));
  }

  return (
    <section className="space-y-3 border-t border-border pt-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">
          <FormattedMessage {...catEditorPanelMessages.comments} />
        </h3>
        {isLoading ? (
          <Skeleton className="h-3 w-6 rounded-full bg-skeleton" />
        ) : (
          <span className="text-xs text-muted-foreground tabular-nums">
            {segmentComments.length}
          </span>
        )}
      </div>
      <CatEditorCommentsList
        comments={segmentComments}
        isLoading={isLoading}
        intl={intl}
        isResolvingComment={isResolvingComment}
        isPostingComment={isPostingComment}
        resolvingCommentId={resolvingCommentId}
        onResolveComment={onResolveComment}
      />
      <Textarea
        value={commentDraft}
        onChange={(event) => handleCommentDraftChange(event.currentTarget.value)}
        className="min-h-20 resize-y rounded-xl border-border bg-background px-3 py-3 text-sm leading-relaxed"
        placeholder={intl.formatMessage(catEditorPanelMessages.commentPlaceholder)}
        disabled={!canAddComment || isPostingComment || isResolvingComment}
        data-cat-comment-input="true"
      />
      {supportsIssueComments ? (
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={commentInputType} onValueChange={handleCommentInputTypeChange}>
            <TabsList className="h-8">
              <TabsTrigger value="comment" className="px-3 text-xs">
                <FormattedMessage {...catEditorPanelMessages.commentTypeComment} />
              </TabsTrigger>
              <TabsTrigger value="issue" className="px-3 text-xs">
                <FormattedMessage {...catEditorPanelMessages.commentTypeIssue} />
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {commentInputType === "issue" ? (
            <div className="flex min-w-48 flex-1 items-center gap-2">
              <span className="text-xs text-muted-foreground">
                <FormattedMessage {...catEditorPanelMessages.issueTypeLabel} />
              </span>
              <Select value={issueType} onValueChange={handleIssueTypeChange}>
                <SelectTrigger className="h-8 flex-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {crowdinIssueTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <FormattedMessage {...option.message} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      ) : null}
      {commentPostError ? <p className="text-sm text-flame-100">{commentPostError}</p> : null}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleAddComment()}
          disabled={
            !canAddComment ||
            !trimmedCommentDraft ||
            isPostingComment ||
            isResolvingComment ||
            !onAddComment
          }
        >
          {isPostingComment ? <Spinner className="size-4" /> : null}
          {isPostingComment ? (
            <FormattedMessage {...catEditorPanelMessages.postingComment} />
          ) : supportsIssueComments && commentInputType === "issue" ? (
            <FormattedMessage {...catEditorPanelMessages.addIssue} />
          ) : (
            <FormattedMessage {...catEditorPanelMessages.addComment} />
          )}
        </Button>
      </div>
    </section>
  );
}
