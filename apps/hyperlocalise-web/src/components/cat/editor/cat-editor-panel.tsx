"use client";

import { lazy, Suspense, useMemo } from "react";
import { useIntl } from "react-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { useIsMac } from "@/hooks/use-is-mac";

import { catEditorPanelMessages } from "@/components/cat/shared/cat.messages";

import { CatEditorActions } from "./cat-editor-actions";
import { CatEditorHeader } from "./cat-editor-header";
import { useCatEditorHotkeys } from "./cat-editor-hotkeys";
import type { CatEditorPanelProps } from "./cat-editor-panel.types";
import { CatEditorSourceSection } from "./cat-editor-source-section";
import { CatEditorTargetSection } from "./cat-editor-target-section";

const CatEditorAiRecommendation = lazy(() =>
  import("./cat-editor-ai-recommendation").then((module) => ({
    default: module.CatEditorAiRecommendation,
  })),
);

const CatEditorFormatChecksSection = lazy(() =>
  import("./cat-editor-format-checks-section").then((module) => ({
    default: module.CatEditorFormatChecksSection,
  })),
);

const CatEditorCommentsSection = lazy(() =>
  import("./cat-editor-comments-section").then((module) => ({
    default: module.CatEditorCommentsSection,
  })),
);

function CatEditorDeferredSectionSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div className="space-y-3" aria-busy="true">
      <Skeleton className="h-3 w-28 rounded-full bg-foreground/8" />
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full rounded-xl bg-foreground/8" />
      ))}
    </div>
  );
}

export function CatEditorPanel({
  segment,
  segmentPosition,
  totalSegments,
  formatChecks,
  intelligence,
  isEditorBusy = false,
  isApproving = false,
  isSavingDraft = false,
  isLookingUpContext = false,
  isAiSuggestionLoading = false,
  isFormatChecksLoading = false,
  isSegmentDetailLoading: _isSegmentDetailLoading = false,
  isCommentsLoading = false,
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
  onSaveDraft,
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
}: CatEditorPanelProps) {
  const intl = useIntl();
  const isMac = useIsMac();
  const resolvedPrimaryActionLabel =
    primaryActionLabel ?? intl.formatMessage(catEditorPanelMessages.approve);
  const supportsIssueComments =
    (providerKind === "crowdin" || providerKind === null) && canAddComment;

  const actionState = useMemo(() => {
    const isActionBlocked =
      isApproving ||
      isSavingDraft ||
      isPostingComment ||
      isLookingUpContext ||
      isAiSuggestionLoading ||
      isFormatChecksLoading;

    return {
      canTriggerApprove: canApprove && !isActionBlocked,
      canTriggerFindContext:
        canLookupContext &&
        !isApproving &&
        !isSavingDraft &&
        !isLookingUpContext &&
        !isAiSuggestionLoading &&
        !isFormatChecksLoading,
      canEditTarget: canEditTranslations && !isEditorBusy,
    };
  }, [
    canApprove,
    canEditTranslations,
    canLookupContext,
    isAiSuggestionLoading,
    isApproving,
    isEditorBusy,
    isFormatChecksLoading,
    isLookingUpContext,
    isPostingComment,
    isSavingDraft,
  ]);

  useCatEditorHotkeys({
    hasPreviousSegment,
    hasNextSegment,
    canTriggerApprove: actionState.canTriggerApprove,
    canTriggerFindContext: actionState.canTriggerFindContext,
    onPrevious,
    onNext,
    onApprove,
    onAskQuestion,
  });

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <CatEditorHeader
        segment={segment}
        segmentPosition={segmentPosition}
        totalSegments={totalSegments}
        isTargetDirty={isTargetDirty}
        segmentShareUrl={segmentShareUrl}
        hasPreviousSegment={hasPreviousSegment}
        hasNextSegment={hasNextSegment}
        isMac={isMac}
        onPrevious={onPrevious}
        onNext={onNext}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-5 sm:px-6 lg:space-y-7 lg:px-8 lg:py-8">
          <CatEditorSourceSection
            sourceText={segment.sourceText}
            sourceLocale={segment.sourceLocale}
          />

          <CatEditorTargetSection
            segment={segment}
            canEditTarget={actionState.canEditTarget}
            onTargetChange={onTargetChange}
            onCopySource={onCopySource}
            onClearTarget={onClearTarget}
          />

          <CatEditorActions
            primaryActionLabel={resolvedPrimaryActionLabel}
            isMac={isMac}
            canTriggerApprove={actionState.canTriggerApprove}
            canTriggerFindContext={actionState.canTriggerFindContext}
            canLookupContext={canLookupContext}
            isApproving={isApproving}
            isSavingDraft={isSavingDraft}
            isLookingUpContext={isLookingUpContext}
            hasPreviousSegment={hasPreviousSegment}
            hasNextSegment={hasNextSegment}
            onApprove={onApprove}
            onSaveDraft={onSaveDraft}
            onAskQuestion={onAskQuestion}
            onPrevious={onPrevious}
            onNext={onNext}
          />

          {canUseAiRecommendation ? (
            <Suspense fallback={<CatEditorDeferredSectionSkeleton lines={3} />}>
              <CatEditorAiRecommendation
                intelligence={intelligence}
                isLoading={isAiSuggestionLoading}
                error={aiRecommendationError}
                onUseAiSuggestion={onUseAiSuggestion}
                onGenerateAiRecommendation={onGenerateAiRecommendation}
              />
            </Suspense>
          ) : null}

          <Suspense fallback={<CatEditorDeferredSectionSkeleton lines={3} />}>
            <CatEditorFormatChecksSection
              formatChecks={formatChecks}
              isLoading={isFormatChecksLoading}
            />
          </Suspense>

          <Suspense fallback={<CatEditorDeferredSectionSkeleton lines={2} />}>
            <CatEditorCommentsSection
              segment={segment}
              isLoading={isCommentsLoading}
              canAddComment={canAddComment}
              supportsIssueComments={supportsIssueComments}
              isPostingComment={isPostingComment}
              isResolvingComment={isResolvingComment}
              resolvingCommentId={resolvingCommentId}
              commentPostError={commentPostError}
              onAddComment={onAddComment}
              onResolveComment={onResolveComment}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

export type { CatEditorPanelProps } from "./cat-editor-panel.types";
