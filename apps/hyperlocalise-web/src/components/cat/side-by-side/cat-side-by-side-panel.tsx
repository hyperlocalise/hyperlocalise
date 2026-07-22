"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { FilterIcon, SearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { observer } from "mobx-react-lite";
import { useCallback, useMemo } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/primitives/cn";

import { CatQueueSkeletonList } from "@/components/cat/queue/cat-queue-skeleton-list";
import { catQueueFilterValues, type CatQueueFilter } from "@/components/cat/queue/cat-queue-filter";
import type { CatQueuePagination } from "@/components/cat/queue/cat-queue-panel";
import {
  catQueuePanelMessages,
  catSideBySidePanelMessages,
  catWorkspaceMessages,
} from "@/components/cat/shared/cat.messages";
import type {
  CatFormatCheck,
  CatSegment,
  CatSegmentCommentInput,
  CatSegmentIntelligence,
  CatTranslationMemoryMatch,
} from "@/components/cat/shared/types";
import { useCatWorkspace } from "@/components/cat/workspace/cat-workspace-context";
import { CatWorkspaceViewSwitcherConnected } from "@/components/cat/workspace/cat-workspace-view-switcher-connected";

import { CatSideBySideIntelligencePanel } from "./cat-side-by-side-intelligence-panel";
import { CatSideBySideVirtualList } from "./cat-side-by-side-virtual-list";

const queueFilterMessageByValue: Record<
  CatQueueFilter,
  (typeof catQueuePanelMessages)[keyof typeof catQueuePanelMessages]
> = {
  all: catQueuePanelMessages.filterAll,
  untranslated: catQueuePanelMessages.filterUntranslated,
  needs_review: catQueuePanelMessages.filterNeedsReview,
  reviewed: catQueuePanelMessages.filterReviewed,
  has_issues: catQueuePanelMessages.filterHasIssues,
  skipped: catQueuePanelMessages.filterSkipped,
};

export const CatSideBySidePanel = observer(function CatSideBySidePanel({
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
  onSearchChange,
  isSearching = false,
  queueFilter = "all",
  onQueueFilterChange,
  availableQueueFilters = catQueueFilterValues,
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
  onRegenerateImage,
  onUploadImage,
  onAskQuestion,
  onRefreshContext,
  onUseTmMatch,
  onAddComment,
  onResolveComment,
  primaryActionLabel,
  segmentShareUrl = null,
  className,
}: {
  segments: CatSegment[];
  focusedSegmentId: string;
  intelligenceSegment: CatSegment | null;
  intelligence: CatSegmentIntelligence | null;
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
  focusedIntelligence?: CatSegmentIntelligence | null;
  aiRecommendationError?: string;
  formatChecks?: CatFormatCheck[];
  segmentFormatChecks?: Record<string, CatFormatCheck[]>;
  formatCheckLoadingSegmentIds?: ReadonlySet<string>;
  isConcordanceLoading: boolean;
  isVisualContextLoading: boolean;
  showAgentContext: boolean;
  showVisualContext: boolean;
  canLookupFreshContext: boolean;
  search?: string;
  onSearchChange?: (value: string) => void;
  isSearching?: boolean;
  queueFilter?: CatQueueFilter;
  onQueueFilterChange?: (filter: CatQueueFilter) => void;
  availableQueueFilters?: CatQueueFilter[];
  isFetchingPage?: boolean;
  isQueueLoading?: boolean;
  pagination?: CatQueuePagination | null;
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
  onRegenerateImage?: (segmentId: string) => void;
  onUploadImage?: (segmentId: string, file: File) => void;
  onAskQuestion?: () => void;
  onRefreshContext?: () => void;
  onUseTmMatch?: (segmentId: string, match: CatTranslationMemoryMatch) => void;
  onAddComment?: (segmentId: string, input: CatSegmentCommentInput) => void | Promise<void>;
  onResolveComment?: (segmentId: string, commentId: string) => void | Promise<void>;
  primaryActionLabel?: string;
  segmentShareUrl?: string | null;
  className?: string;
}) {
  const intl = useIntl();
  const store = useCatWorkspace();
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
    ? catQueuePanelMessages.emptySearchResults
    : hasActiveFilter
      ? catQueuePanelMessages.emptyFilterResults
      : catWorkspaceMessages.emptyQueue;

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
    <div
      className={cn(
        "grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,22rem)] overflow-hidden bg-background",
        className,
      )}
    >
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="shrink-0 space-y-3 border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            {onSearchChange ? (
              <div className="relative min-w-0 flex-1">
                <HugeiconsIcon
                  icon={SearchIcon}
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={search}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder={intl.formatMessage(catQueuePanelMessages.searchPlaceholder)}
                  aria-label={intl.formatMessage(catQueuePanelMessages.searchAria)}
                  className="h-9 pl-9"
                />
                {isSearching ? (
                  <Spinner className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2" />
                ) : null}
              </div>
            ) : (
              <div className="flex-1" />
            )}

            <div className="flex shrink-0 items-center gap-2">
              {onQueueFilterChange ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5 px-2.5"
                        aria-label={intl.formatMessage(catQueuePanelMessages.filterQueueAria)}
                      />
                    }
                  >
                    <HugeiconsIcon icon={FilterIcon} className="size-4" />
                    <span className="hidden text-xs sm:inline">
                      <FormattedMessage {...queueFilterMessageByValue[queueFilter]} />
                    </span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-44">
                    <DropdownMenuRadioGroup
                      value={queueFilter}
                      onValueChange={(value) => {
                        if (
                          value === "all" ||
                          value === "untranslated" ||
                          value === "needs_review" ||
                          value === "reviewed" ||
                          value === "has_issues" ||
                          value === "skipped"
                        ) {
                          onQueueFilterChange(value);
                        }
                      }}
                    >
                      {availableQueueFilters.map((filter) => (
                        <DropdownMenuRadioItem key={filter} value={filter}>
                          <FormattedMessage {...queueFilterMessageByValue[filter]} />
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}

              <CatWorkspaceViewSwitcherConnected />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-0 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <p className="border-r border-border pr-4">
              <FormattedMessage {...catSideBySidePanelMessages.sourceColumn} />
            </p>
            <p className="pl-4">
              <FormattedMessage {...catSideBySidePanelMessages.translationColumn} />
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {isQueueLoading && segments.length === 0 ? (
            <CatQueueSkeletonList className="px-4 py-3" />
          ) : segments.length === 0 ? (
            <div className="flex flex-1 items-center justify-center px-4 py-8 text-sm text-muted-foreground">
              <FormattedMessage {...emptyMessage} />
            </div>
          ) : (
            <CatSideBySideVirtualList
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
                {...catQueuePanelMessages.paginationSummary}
                values={{
                  count: loadedCount,
                  more: hasMoreQueue ? "+" : "",
                }}
              />
            </p>
            <p className="font-mono tabular-nums">
              <FormattedMessage
                {...catSideBySidePanelMessages.segmentPosition}
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
                <FormattedMessage {...catQueuePanelMessages.loadMore} />
              </Button>
            ) : (
              <span />
            )}
          </div>
        </div>
      </div>

      <div className="h-full min-h-0 min-w-0">
        <CatSideBySideIntelligencePanel
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
          placement="right"
          className="h-full"
        />
      </div>
    </div>
  );
});
