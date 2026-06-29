"use client";

import { useMemo, useState } from "react";
import { ArrowLeft01Icon, ArrowRight01Icon, LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckIcon } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
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
import { cn } from "@/lib/primitives/cn";

import { CatFormatChecks } from "./cat-format-checks";
import { catEditorPanelMessages } from "./cat.messages";
import { analyzeCatMessageFormat } from "./cat-message-format";
import { CatIcuStructureSummary, CatMessagePreview, CatTargetEditor } from "./cat-target-editor";
import type {
  CatFormatCheck,
  CatSegment,
  CatSegmentCommentInput,
  CatSegmentCommentType,
  CatSegmentIntelligence,
  CrowdinIssueType,
} from "./types";

function ShortcutKbd({ keys, className }: { keys: string[]; className?: string }) {
  return (
    <KbdGroup aria-hidden="true" className="ms-2 hidden items-center gap-1 lg:inline-flex">
      {keys.map((key) => (
        <Kbd key={key} className={className}>
          {key}
        </Kbd>
      ))}
    </KbdGroup>
  );
}

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

function isOpenIssueStatus(status: string | null | undefined) {
  return status === "open" || status === "unresolved";
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

export function CatEditorPanel({
  segment,
  segmentPosition,
  totalSegments,
  formatChecks,
  intelligence,
  isEditorBusy,
  isApproving = false,
  isLookingUpContext = false,
  isAiSuggestionLoading = false,
  isFormatChecksLoading = false,
  canApprove = true,
  canAddComment = false,
  canEditTranslations = true,
  canLookupContext = false,
  canUseAiRecommendation = false,
  isTargetDirty = false,
  isPostingComment = false,
  isResolvingComment = false,
  resolvingCommentId = null,
  commentPostError,
  providerKind = null,
  onTargetChange,
  onCopySource,
  onClearTarget,
  onUseAiSuggestion,
  onApprove,
  onAddComment,
  onResolveComment,
  primaryActionLabel,
  onAskQuestion,
  onGenerateAiRecommendation,
  aiRecommendationError,
  onPrevious,
  onNext,
  hasPreviousSegment,
  hasNextSegment,
  segmentShareUrl = null,
}: {
  segment: CatSegment;
  segmentPosition: number;
  totalSegments: number;
  formatChecks: CatFormatCheck[];
  intelligence: CatSegmentIntelligence;
  isEditorBusy?: boolean;
  isApproving?: boolean;
  isLookingUpContext?: boolean;
  isAiSuggestionLoading?: boolean;
  isFormatChecksLoading?: boolean;
  canApprove?: boolean;
  canAddComment?: boolean;
  canEditTranslations?: boolean;
  canLookupContext?: boolean;
  canUseAiRecommendation?: boolean;
  isTargetDirty?: boolean;
  isPostingComment?: boolean;
  isResolvingComment?: boolean;
  resolvingCommentId?: string | null;
  commentPostError?: string;
  onTargetChange: (value: string) => void;
  onCopySource: () => void;
  onClearTarget: () => void;
  onUseAiSuggestion: () => void;
  onApprove: () => void;
  onAddComment?: (input: CatSegmentCommentInput) => void | Promise<void>;
  onResolveComment?: (commentId: string) => void | Promise<void>;
  primaryActionLabel?: string;
  onAskQuestion: () => void;
  onGenerateAiRecommendation?: () => void;
  aiRecommendationError?: string;
  onPrevious: () => void;
  onNext: () => void;
  hasPreviousSegment: boolean;
  hasNextSegment: boolean;
  segmentShareUrl?: string | null;
  providerKind?: string | null;
}) {
  const intl = useIntl();
  const [shareLinkState, setShareLinkState] = useState<"idle" | "copied" | "error">("idle");
  const resolvedPrimaryActionLabel =
    primaryActionLabel ?? intl.formatMessage(catEditorPanelMessages.approve);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentInputTypes, setCommentInputTypes] = useState<Record<string, CatSegmentCommentType>>(
    {},
  );
  const [issueTypes, setIssueTypes] = useState<Record<string, CrowdinIssueType>>({});
  const commentDraft = commentDrafts[segment.id] ?? "";
  const commentInputType = commentInputTypes[segment.id] ?? "comment";
  const issueType = issueTypes[segment.id] ?? "general_question";
  const segmentComments = segment.comments ?? [];
  const trimmedCommentDraft = commentDraft.trim();
  const supportsCrowdinIssues = providerKind === "crowdin" && canAddComment;
  const isActionBlocked =
    isApproving ||
    isPostingComment ||
    isLookingUpContext ||
    isAiSuggestionLoading ||
    isFormatChecksLoading;
  const canTriggerApprove = canApprove && !isActionBlocked;
  const canEditTarget = canEditTranslations && !isEditorBusy;
  const sourceMessageAnalysis = useMemo(
    () => analyzeCatMessageFormat(segment.sourceText),
    [segment.sourceText],
  );

  useHotkeys(
    "mod+arrowleft, mod+arrowup",
    (event) => {
      event.preventDefault();
      onPrevious();
    },
    {
      enabled: hasPreviousSegment,
      enableOnFormTags: false,
      preventDefault: true,
    },
    [hasPreviousSegment, onPrevious],
  );

  useHotkeys(
    "mod+arrowright, mod+arrowdown",
    (event) => {
      event.preventDefault();
      onNext();
    },
    {
      enabled: hasNextSegment,
      enableOnFormTags: false,
      preventDefault: true,
    },
    [hasNextSegment, onNext],
  );

  useHotkeys(
    "mod+enter",
    (event) => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement.dataset.catCommentInput === "true"
      ) {
        return;
      }

      event.preventDefault();
      onApprove();
    },
    {
      enabled: canTriggerApprove,
      enableOnFormTags: true,
      preventDefault: true,
    },
    [canTriggerApprove, onApprove],
  );

  function handleCommentDraftChange(value: string) {
    setCommentDrafts((current) => ({ ...current, [segment.id]: value }));
  }

  async function handleAddComment() {
    if (!trimmedCommentDraft || !onAddComment || isPostingComment) {
      return;
    }

    const input: CatSegmentCommentInput = {
      text: trimmedCommentDraft,
      ...(supportsCrowdinIssues && commentInputType === "issue"
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

  async function handleShareSegment() {
    if (!segmentShareUrl) {
      return;
    }

    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      setShareLinkState("error");
      return;
    }

    try {
      await navigator.clipboard.writeText(segmentShareUrl);
      setShareLinkState("copied");
      window.setTimeout(() => setShareLinkState("idle"), 2000);
    } catch {
      setShareLinkState("error");
      window.setTimeout(() => setShareLinkState("idle"), 2000);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-foreground/8 px-4 py-3 lg:px-5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {String(segmentPosition).padStart(2, "0")} / {String(totalSegments).padStart(2, "0")}
          </span>
          {isTargetDirty ? (
            <Badge variant="outline" className="border-bud-500/40 bg-bud-500/10 text-bud-300">
              <FormattedMessage {...catEditorPanelMessages.unsavedChanges} />
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {segmentShareUrl ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void handleShareSegment()}
              aria-label={intl.formatMessage(catEditorPanelMessages.shareSegmentAria)}
              title={
                shareLinkState === "copied"
                  ? intl.formatMessage(catEditorPanelMessages.shareSegmentCopied)
                  : shareLinkState === "error"
                    ? intl.formatMessage(catEditorPanelMessages.shareSegmentFailed)
                    : intl.formatMessage(catEditorPanelMessages.shareSegment)
              }
            >
              {shareLinkState === "copied" ? (
                <CheckIcon className="size-4" />
              ) : (
                <HugeiconsIcon icon={LinkSquare02Icon} className="size-4" />
              )}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onPrevious}
            disabled={!hasPreviousSegment}
            aria-label={intl.formatMessage(catEditorPanelMessages.previousSegmentAria)}
            title={intl.formatMessage(catEditorPanelMessages.previousSegmentTitle)}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onNext}
            disabled={!hasNextSegment}
            aria-label={intl.formatMessage(catEditorPanelMessages.nextSegmentAria)}
            title={intl.formatMessage(catEditorPanelMessages.nextSegmentTitle)}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-5 sm:px-6 lg:space-y-7 lg:px-8 lg:py-8">
          <section className="space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground">
              <FormattedMessage
                {...catEditorPanelMessages.sourceHeading}
                values={{ locale: segment.sourceLocale }}
              />
            </h3>
            <p className="text-pretty text-base leading-relaxed text-foreground/92 lg:text-lg">
              <CatMessagePreview message={segment.sourceText} />
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">
                <FormattedMessage
                  {...catEditorPanelMessages.targetHeading}
                  values={{ locale: segment.targetLocale }}
                />
              </h3>
              {canEditTarget ? (
                <div className="flex flex-wrap items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={onCopySource}>
                    <FormattedMessage {...catEditorPanelMessages.copySource} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClearTarget}
                    disabled={segment.targetText.length === 0}
                  >
                    <FormattedMessage {...catEditorPanelMessages.clearTarget} />
                  </Button>
                </div>
              ) : null}
            </div>
            <CatTargetEditor
              key={segment.id}
              sourceText={segment.sourceText}
              value={segment.targetText}
              maxLength={segment.maxLength}
              onChange={onTargetChange}
              disabled={!canEditTarget}
            />
            <CatIcuStructureSummary blocks={sourceMessageAnalysis.icuBlocks} />
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="min-h-11 flex-1 bg-grove-500 text-white hover:bg-grove-400 sm:flex-none lg:min-h-0"
              onClick={onApprove}
              disabled={!canTriggerApprove}
            >
              {isApproving ? <Spinner className="size-4 text-white" /> : null}
              {resolvedPrimaryActionLabel}
              <ShortcutKbd keys={["⌘", "↵"]} className="bg-white/15 text-white" />
            </Button>
            <Button
              variant="outline"
              className="min-h-11 flex-1 sm:flex-none lg:min-h-0"
              onClick={onAskQuestion}
              disabled={
                !canLookupContext ||
                isApproving ||
                isLookingUpContext ||
                isAiSuggestionLoading ||
                isFormatChecksLoading
              }
              title={
                canLookupContext
                  ? intl.formatMessage(catEditorPanelMessages.findContextTitle)
                  : intl.formatMessage(catEditorPanelMessages.findContextUnavailableTitle)
              }
            >
              {isLookingUpContext ? <Spinner className="size-4" /> : null}
              {isLookingUpContext ? (
                <FormattedMessage {...catEditorPanelMessages.findingContext} />
              ) : (
                <FormattedMessage {...catEditorPanelMessages.findContext} />
              )}
              <ShortcutKbd keys={["⌘", "K"]} />
            </Button>
            <Button
              variant="ghost"
              className="hidden lg:inline-flex"
              onClick={onPrevious}
              disabled={isApproving || isLookingUpContext || !hasPreviousSegment}
            >
              <FormattedMessage {...catEditorPanelMessages.previous} />
              <ShortcutKbd keys={["⌘", "←"]} />
            </Button>
            <Button
              variant="ghost"
              className="hidden lg:inline-flex"
              onClick={onNext}
              disabled={isApproving || isLookingUpContext || !hasNextSegment}
            >
              <FormattedMessage {...catEditorPanelMessages.next} />
              <ShortcutKbd keys={["⌘", "→"]} />
            </Button>
          </div>

          {canUseAiRecommendation ? (
            isAiSuggestionLoading ? (
              <aside className="space-y-3 rounded-xl border border-foreground/8 bg-foreground/2 p-4">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-3 w-28 rounded-full bg-foreground/8" />
                  <Skeleton className="h-8 w-12 rounded-md bg-foreground/8" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-11/12 rounded-full bg-foreground/8" />
                  <Skeleton className="h-4 w-8/12 rounded-full bg-foreground/8" />
                </div>
                <Skeleton className="h-3 w-10/12 rounded-full bg-foreground/8" />
              </aside>
            ) : (
              <aside
                className={cn(
                  "border-l pl-4",
                  intelligence.aiSuggestion ? "border-grove-300/40" : "border-foreground/12",
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    <FormattedMessage {...catEditorPanelMessages.aiRecommendation} />
                  </p>
                  <div className="flex items-center gap-1">
                    {intelligence.aiSuggestion ? (
                      <Button variant="ghost" size="sm" onClick={onUseAiSuggestion}>
                        <FormattedMessage {...catEditorPanelMessages.use} />
                      </Button>
                    ) : null}
                    {onGenerateAiRecommendation ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onGenerateAiRecommendation}
                        disabled={isAiSuggestionLoading}
                      >
                        {intelligence.aiSuggestion ? (
                          <FormattedMessage {...catEditorPanelMessages.regenerate} />
                        ) : (
                          <FormattedMessage {...catEditorPanelMessages.getRecommendation} />
                        )}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {aiRecommendationError ? (
                  <p className="text-sm leading-relaxed text-flame-100">{aiRecommendationError}</p>
                ) : intelligence.aiSuggestion ? (
                  <>
                    <p className="text-sm leading-relaxed text-foreground/88">
                      {intelligence.aiSuggestion}
                    </p>
                    {intelligence.aiReasoning ? (
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        <span className="font-medium text-foreground/70">
                          <FormattedMessage {...catEditorPanelMessages.reasoningPrefix} />
                        </span>{" "}
                        {intelligence.aiReasoning}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    <FormattedMessage {...catEditorPanelMessages.aiSuggestionEmpty} />
                  </p>
                )}
              </aside>
            )
          ) : null}

          <section className="space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground">
              <FormattedMessage {...catEditorPanelMessages.formatQaChecks} />
            </h3>
            {isFormatChecksLoading ? (
              <div className="space-y-0 divide-y divide-foreground/8 rounded-xl border border-foreground/8 bg-foreground/2">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="flex items-start gap-3 px-3 py-3">
                    <Skeleton className="size-4 shrink-0 rounded-full bg-foreground/8" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <Skeleton className="h-4 w-36 rounded-full bg-foreground/8" />
                        <Skeleton className="h-3 w-12 rounded-full bg-foreground/8" />
                      </div>
                      <Skeleton className="h-3 w-10/12 rounded-full bg-foreground/8" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <CatFormatChecks checks={formatChecks} />
            )}
          </section>

          <section className="space-y-3 border-t border-foreground/8 pt-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">
                <FormattedMessage {...catEditorPanelMessages.comments} />
              </h3>
              <span className="text-xs text-muted-foreground tabular-nums">
                {segmentComments.length}
              </span>
            </div>
            {segmentComments.length > 0 ? (
              <ul className="space-y-3">
                {segmentComments.map((comment) => (
                  <li
                    key={comment.id}
                    className="space-y-1 rounded-lg border border-foreground/8 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {comment.type === "issue" ? (
                        <Badge variant="outline" className="border-flame-200/40 text-flame-100">
                          <FormattedMessage {...catEditorPanelMessages.commentIssueLabel} />
                        </Badge>
                      ) : null}
                      {comment.author ? (
                        <span className="font-medium text-foreground/78">{comment.author}</span>
                      ) : null}
                      {comment.createdAt ? (
                        <span>{formatCommentTimestamp(intl, comment.createdAt)}</span>
                      ) : null}
                      {comment.status ? <span className="capitalize">{comment.status}</span> : null}
                    </div>
                    <p className="text-sm leading-relaxed text-foreground/88">{comment.text}</p>
                    {comment.type === "issue" &&
                    isOpenIssueStatus(comment.status) &&
                    onResolveComment ? (
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
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                <FormattedMessage {...catEditorPanelMessages.noComments} />
              </p>
            )}
            <Textarea
              value={commentDraft}
              onChange={(event) => handleCommentDraftChange(event.currentTarget.value)}
              className="min-h-20 resize-y rounded-xl border-foreground/12 bg-background px-3 py-3 text-sm leading-relaxed"
              placeholder={intl.formatMessage(catEditorPanelMessages.commentPlaceholder)}
              disabled={!canAddComment || isPostingComment || isResolvingComment}
              data-cat-comment-input="true"
            />
            {supportsCrowdinIssues ? (
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
                ) : supportsCrowdinIssues && commentInputType === "issue" ? (
                  <FormattedMessage {...catEditorPanelMessages.addIssue} />
                ) : (
                  <FormattedMessage {...catEditorPanelMessages.addComment} />
                )}
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
