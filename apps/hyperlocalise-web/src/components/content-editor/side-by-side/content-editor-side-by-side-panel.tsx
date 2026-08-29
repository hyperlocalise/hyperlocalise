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
import { observer } from "mobx-react-lite";
import { useCallback, useMemo } from "react";
import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/primitives/cn";

import { ContentEditorQueueSkeletonList } from "@/components/content-editor/queue/content-editor-queue-skeleton-list";
import type { ContentEditorQueueFilter } from "@/components/content-editor/queue/content-editor-queue-filter";
import type { ContentEditorQueuePagination } from "@/components/content-editor/queue/content-editor-queue-panel";
import {
  contentEditorQueuePanelMessages,
  contentEditorSideBySidePanelMessages,
  contentEditorWorkspaceMessages,
} from "@/components/content-editor/shared/content-editor.messages";
import type {
  ContentEditorFormatCheck,
  ContentEditorSegment,
  ContentEditorSegmentCommentInput,
  ContentEditorSegmentIntelligence,
  ContentEditorTranslationMemoryMatch,
} from "@/components/content-editor/shared/types";
import { useContentEditorWorkspace } from "@/components/content-editor/workspace/content-editor-workspace-context";
import { ContentEditorSideBySideResizableLayout } from "@/components/content-editor/workspace/content-editor-workspace-resizable-layout";

import { ContentEditorSideBySideIntelligencePanel } from "./content-editor-side-by-side-intelligence-panel";
import { ContentEditorSideBySideVirtualList } from "./content-editor-side-by-side-virtual-list";

export const ContentEditorSideBySidePanel = observer(function ContentEditorSideBySidePanel({
  segments,
  focusedSegmentId,
  intelligenceSegment,
  intelligence,
  dirtySegmentIds,
  loadingSegmentIds,
  canEditTranslations,
  canAddComment,
  supportsIssueComments,
  isCommentsLoading,
  isPostingComment,
  isResolvingComment,
  resolvingCommentId,
  commentPostError,
  isLookingUpContext,
  isApproving = false,
  isSavingDraft = false,
  isAiSuggestionLoading = false,
  isFormatChecksLoading = false,
  isImageBusy = false,
  canUseAiRecommendation = false,
  focusedIntelligence = null,
  aiRecommendationError,
  formatChecks = [],
  segmentFormatChecks,
  formatCheckLoadingSegmentIds,
  isConcordanceLoading,
  isVisualContextLoading,
  showAgentContext,
  showVisualContext,
  canLookupFreshContext,
  search = "",
  queueFilter = "all",
  isFetchingPage = false,
  isQueueLoading = false,
  pagination = null,
  hasMoreQueue = false,
  onLoadMoreQueue,
  onFocusSegment,
  onTargetChange,
  onApprove,
  onSaveDraft,
  onAddToIssueSheet,
  onUseAiSuggestion,
  onGenerateAiRecommendation,
  onTreatAsImage,
  onTreatAsVideo,
  onRegenerateImage,
  onUploadImage,
  onAskQuestion,
  onRefreshContext,
  onUseTmMatch,
  onAddComment,
  onResolveComment,
  showMaxLengthEditor = false,
  isMaxLengthSaving = false,
  onSetMaxLength,
  primaryActionLabel,
  segmentShareUrl = null,
  className,
  organizationSlug,
  projectId,
  onGlossaryTermAdded,
}: {
  segments: ContentEditorSegment[];
  focusedSegmentId: string;
  intelligenceSegment: ContentEditorSegment | null;
  intelligence: ContentEditorSegmentIntelligence | null;
  dirtySegmentIds?: ReadonlySet<string>;
  loadingSegmentIds?: ReadonlySet<string>;
  canEditTranslations: boolean;
  canAddComment: boolean;
  supportsIssueComments: boolean;
  isCommentsLoading: boolean;
  isPostingComment: boolean;
  isResolvingComment: boolean;
  resolvingCommentId: string | null;
  commentPostError?: string;
  isLookingUpContext: boolean;
  isApproving?: boolean;
  isSavingDraft?: boolean;
  isAiSuggestionLoading?: boolean;
  isFormatChecksLoading?: boolean;
  isImageBusy?: boolean;
  canUseAiRecommendation?: boolean;
  focusedIntelligence?: ContentEditorSegmentIntelligence | null;
  aiRecommendationError?: string;
  formatChecks?: ContentEditorFormatCheck[];
  segmentFormatChecks?: Record<string, ContentEditorFormatCheck[]>;
  formatCheckLoadingSegmentIds?: ReadonlySet<string>;
  isConcordanceLoading: boolean;
  isVisualContextLoading: boolean;
  showAgentContext: boolean;
  showVisualContext: boolean;
  canLookupFreshContext: boolean;
  search?: string;
  queueFilter?: ContentEditorQueueFilter;
  isFetchingPage?: boolean;
  isQueueLoading?: boolean;
  pagination?: ContentEditorQueuePagination | null;
  hasMoreQueue?: boolean;
  onLoadMoreQueue?: () => void;
  onFocusSegment: (segmentId: string) => void;
  onTargetChange: (segmentId: string, value: string) => void;
  onApprove?: (segmentId: string) => void;
  onSaveDraft?: (segmentId: string) => void;
  onAddToIssueSheet?: (segmentId: string) => void;
  onUseAiSuggestion?: (segmentId: string) => void;
  onGenerateAiRecommendation?: (segmentId: string) => void;
  onTreatAsImage?: (segmentId: string, treatAsImage: boolean) => void;
  onTreatAsVideo?: (segmentId: string, treatAsVideo: boolean) => void;
  onRegenerateImage?: (segmentId: string) => void;
  onUploadImage?: (segmentId: string, file: File) => void;
  onAskQuestion?: () => void;
  onRefreshContext?: () => void;
  onUseTmMatch?: (segmentId: string, match: ContentEditorTranslationMemoryMatch) => void;
  onAddComment?: (
    segmentId: string,
    input: ContentEditorSegmentCommentInput,
  ) => void | Promise<void>;
  onResolveComment?: (segmentId: string, commentId: string) => void | Promise<void>;
  showMaxLengthEditor?: boolean;
  isMaxLengthSaving?: boolean;
  onSetMaxLength?: (maxLength: number | null) => void | Promise<void>;
  primaryActionLabel?: string;
  segmentShareUrl?: string | null;
  className?: string;
  organizationSlug?: string;
  projectId?: string;
  onGlossaryTermAdded?: () => void;
}) {
  const store = useContentEditorWorkspace();
  const hoveredSegmentId = store.ui.hoveredSegmentId;
  const intelligenceSegmentId = store.intelligenceSegmentId;
  const handleVisibleSegmentIdsChange = useCallback(
    (segmentIds: string[]) => store.ui.setVisibleSideBySideSegmentIds(segmentIds),
    [store],
  );

  const loadedCount = segments.length;
  const hasActiveFilter = queueFilter !== "all";
  const hasSearch = search.trim().length > 0;
  const emptyMessage = hasSearch
    ? contentEditorQueuePanelMessages.emptySearchResults
    : hasActiveFilter
      ? contentEditorQueuePanelMessages.emptyFilterResults
      : contentEditorWorkspaceMessages.emptyQueue;

  const focusedIndex = useMemo(
    () => segments.findIndex((segment) => segment.id === focusedSegmentId),
    [focusedSegmentId, segments],
  );
  const segmentPosition =
    focusedIndex >= 0
      ? (segments[focusedIndex]?.index ?? focusedIndex + 1)
      : (pagination?.offset ?? 0) + 1;
  const totalSegments = hasMoreQueue ? null : (pagination?.totalCount ?? segments.length);

  return (
    <ContentEditorSideBySideResizableLayout
      className={cn("bg-background", className)}
      editor={
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-border px-4 py-3">
            <div className="grid grid-cols-2 gap-0 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <p className="border-r border-border pr-4">
                <FormattedMessage {...contentEditorSideBySidePanelMessages.sourceColumn} />
              </p>
              <p className="pl-4">
                <FormattedMessage {...contentEditorSideBySidePanelMessages.translationColumn} />
              </p>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            {isQueueLoading && segments.length === 0 ? (
              <ContentEditorQueueSkeletonList className="px-4 py-3" />
            ) : segments.length === 0 ? (
              <div className="flex flex-1 items-center justify-center px-4 py-8 text-sm text-muted-foreground">
                <FormattedMessage {...emptyMessage} />
              </div>
            ) : (
              <ContentEditorSideBySideVirtualList
                segments={segments}
                focusedSegmentId={focusedSegmentId}
                hoveredSegmentId={hoveredSegmentId}
                dirtySegmentIds={dirtySegmentIds}
                canEdit={canEditTranslations}
                loadingSegmentIds={loadingSegmentIds}
                isApproving={isApproving}
                isSavingDraft={isSavingDraft}
                isPostingComment={isPostingComment}
                isLookingUpContext={isLookingUpContext}
                isAiSuggestionLoading={isAiSuggestionLoading}
                isFormatChecksLoading={isFormatChecksLoading}
                isImageBusy={isImageBusy}
                canUseAiRecommendation={canUseAiRecommendation}
                focusedIntelligence={focusedIntelligence}
                aiRecommendationError={aiRecommendationError}
                formatChecks={formatChecks}
                segmentFormatChecks={segmentFormatChecks}
                formatCheckLoadingSegmentIds={formatCheckLoadingSegmentIds}
                primaryActionLabel={primaryActionLabel}
                segmentShareUrl={segmentShareUrl}
                onFocusSegment={onFocusSegment}
                onHoverSegment={(segmentId) => store.ui.setHoveredSegment(segmentId)}
                onLeaveSegment={() => store.ui.clearHoveredSegment()}
                onVisibleSegmentIdsChange={handleVisibleSegmentIdsChange}
                onTargetChange={onTargetChange}
                onApprove={onApprove}
                onSaveDraft={onSaveDraft}
                onAddToIssueSheet={onAddToIssueSheet}
                onUseAiSuggestion={onUseAiSuggestion}
                onGenerateAiRecommendation={onGenerateAiRecommendation}
                onTreatAsImage={onTreatAsImage}
                onTreatAsVideo={onTreatAsVideo}
                onRegenerateImage={onRegenerateImage}
                onUploadImage={onUploadImage}
                hasMore={hasMoreQueue}
                isLoadingMore={isFetchingPage}
                onNearEnd={onLoadMoreQueue}
              />
            )}

            <div className="flex shrink-0 items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
              <p>
                <FormattedMessage
                  {...contentEditorQueuePanelMessages.paginationSummary}
                  values={{
                    count: loadedCount,
                    more: hasMoreQueue ? "+" : "",
                  }}
                />
              </p>
              <p className="font-mono tabular-nums">
                <FormattedMessage
                  {...contentEditorSideBySidePanelMessages.segmentPosition}
                  values={{
                    position: segmentPosition,
                    total: totalSegments ?? `${loadedCount}+`,
                  }}
                />
              </p>
              {hasMoreQueue && onLoadMoreQueue ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={onLoadMoreQueue}
                  disabled={isFetchingPage}
                >
                  {isFetchingPage ? <Spinner className="size-3.5" /> : null}
                  <FormattedMessage {...contentEditorQueuePanelMessages.loadMore} />
                </Button>
              ) : (
                <span />
              )}
            </div>
          </div>
        </div>
      }
      intelligence={
        <ContentEditorSideBySideIntelligencePanel
          segment={intelligenceSegment}
          intelligence={intelligence}
          isLookingUpContext={isLookingUpContext}
          isApproving={isApproving}
          isSavingDraft={isSavingDraft}
          isAiSuggestionLoading={isAiSuggestionLoading}
          isFormatChecksLoading={isFormatChecksLoading}
          isConcordanceLoading={isConcordanceLoading}
          isVisualContextLoading={isVisualContextLoading}
          showAgentContext={showAgentContext}
          showVisualContext={showVisualContext}
          canEditTranslations={canEditTranslations}
          canLookupFreshContext={canLookupFreshContext}
          canAddComment={canAddComment}
          supportsIssueComments={supportsIssueComments}
          isCommentsLoading={isCommentsLoading}
          isPostingComment={isPostingComment}
          isResolvingComment={isResolvingComment}
          resolvingCommentId={resolvingCommentId}
          commentPostError={commentPostError}
          onAskQuestion={onAskQuestion}
          onRefreshContext={onRefreshContext}
          onUseTmMatch={
            onUseTmMatch && intelligenceSegment
              ? (match) => onUseTmMatch(intelligenceSegmentId, match)
              : undefined
          }
          onAddComment={
            onAddComment && intelligenceSegment
              ? (input) => onAddComment(intelligenceSegmentId, input)
              : undefined
          }
          onResolveComment={
            onResolveComment && intelligenceSegment
              ? (commentId) => onResolveComment(intelligenceSegmentId, commentId)
              : undefined
          }
          onOpenIssueSheet={
            onAddToIssueSheet && intelligenceSegment
              ? () => onAddToIssueSheet(intelligenceSegmentId)
              : undefined
          }
          showMaxLengthEditor={showMaxLengthEditor}
          isMaxLengthSaving={isMaxLengthSaving}
          onSetMaxLength={onSetMaxLength}
          placement="right"
          organizationSlug={organizationSlug}
          projectId={projectId}
          onGlossaryTermAdded={onGlossaryTermAdded}
          className="h-full"
        />
      }
    />
  );
});
