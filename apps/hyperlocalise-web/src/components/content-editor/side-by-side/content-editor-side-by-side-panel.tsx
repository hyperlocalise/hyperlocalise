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
import { ArrowLeftIcon, ArrowRightIcon, FileIcon } from "@phosphor-icons/react";
import { observer } from "mobx-react-lite";
import { useCallback, useMemo } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
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
import { getLocaleFlagEmoji } from "@/lib/i18n/locales";

import {
  SIDE_BY_SIDE_GRID_CLASS_NAME,
  SIDE_BY_SIDE_SOURCE_AREA_CLASS_NAME,
  SIDE_BY_SIDE_STATUS_AREA_CLASS_NAME,
  SIDE_BY_SIDE_TARGET_AREA_CLASS_NAME,
} from "./content-editor-side-by-side-grid";
import { ContentEditorSideBySideIntelligencePanel } from "./content-editor-side-by-side-intelligence-panel";
import { ContentEditorSideBySideVirtualList } from "./content-editor-side-by-side-virtual-list";

function LocaleTag({ locale }: { locale?: string }) {
  if (!locale) {
    return null;
  }
  const flag = getLocaleFlagEmoji(locale);
  return (
    <span className="inline-flex items-center gap-1 rounded bg-muted px-1 py-px font-mono text-[10px] font-normal tracking-normal normal-case">
      {flag ? <span aria-hidden="true">{flag}</span> : null}
      {locale}
    </span>
  );
}

function SideBySideColumnHeader({
  sourceLocale,
  targetLocale,
}: {
  sourceLocale?: string;
  targetLocale?: string;
}) {
  return (
    <div
      className={cn(
        SIDE_BY_SIDE_GRID_CLASS_NAME,
        "shrink-0 border-b border-border bg-muted/30 px-4 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase",
      )}
    >
      <p className={cn(SIDE_BY_SIDE_STATUS_AREA_CLASS_NAME, "hidden @3xl:block")}>
        <FormattedMessage {...contentEditorSideBySidePanelMessages.statusColumn} />
      </p>
      <p className={cn(SIDE_BY_SIDE_SOURCE_AREA_CLASS_NAME, "flex items-center gap-1.5")}>
        <span>
          <FormattedMessage {...contentEditorSideBySidePanelMessages.sourceColumn} />
        </span>
        <LocaleTag locale={sourceLocale} />
      </p>
      <p className={cn(SIDE_BY_SIDE_TARGET_AREA_CLASS_NAME, "flex items-center gap-1.5")}>
        <span>
          <FormattedMessage {...contentEditorSideBySidePanelMessages.translationColumn} />
        </span>
        <LocaleTag locale={targetLocale} />
      </p>
    </div>
  );
}

function SideBySideFileToolbar({
  filename,
  totalCount,
  position,
  onPrevious,
  onNext,
}: {
  filename?: string;
  totalCount: number | null;
  position: number;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const intl = useIntl();
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
      <FileIcon className="size-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 truncate text-sm font-medium" title={filename}>
        {filename}
      </p>
      {totalCount !== null ? (
        <Badge variant="outline" className="shrink-0 font-mono tabular-nums">
          <FormattedMessage
            {...contentEditorSideBySidePanelMessages.stringCount}
            values={{ count: totalCount }}
          />
        </Badge>
      ) : null}
      <div className="ms-auto flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="size-7"
          disabled={!onPrevious}
          onClick={onPrevious}
          aria-label={intl.formatMessage(contentEditorSideBySidePanelMessages.previousString)}
        >
          <ArrowLeftIcon className="size-3.5" />
        </Button>
        <p className="min-w-14 text-center font-mono text-xs text-muted-foreground tabular-nums">
          <FormattedMessage
            {...contentEditorSideBySidePanelMessages.segmentPosition}
            values={{ position, total: totalCount ?? "…" }}
          />
        </p>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="size-7"
          disabled={!onNext}
          onClick={onNext}
          aria-label={intl.formatMessage(contentEditorSideBySidePanelMessages.nextString)}
        >
          <ArrowRightIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function ContentEditorSideBySidePanelSkeleton({
  className,
  sourceLocale,
  targetLocale,
}: {
  className?: string;
  sourceLocale?: string;
  targetLocale?: string;
}) {
  return (
    <ContentEditorSideBySideResizableLayout
      className={cn("bg-background", className)}
      editor={
        <div className="@container flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          <SideBySideColumnHeader sourceLocale={sourceLocale} targetLocale={targetLocale} />
          <div className="flex min-h-0 flex-1 flex-col">
            <ContentEditorQueueSkeletonList className="px-4 py-3" />
          </div>
        </div>
      }
      intelligence={
        <div className="flex h-full min-h-0 flex-col bg-background lg:border-l lg:border-border" />
      }
    />
  );
}

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
  isImageGenerating = false,
  generatingImageSegmentId,
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
  isTranslationViewLoading = false,
  pagination = null,
  hasMoreQueue = false,
  onLoadMoreQueue,
  hasPreviousSegment,
  hasNextSegment,
  onPreviousSegment,
  onNextSegment,
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
  isImageGenerating?: boolean;
  generatingImageSegmentId?: string;
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
  isTranslationViewLoading?: boolean;
  pagination?: ContentEditorQueuePagination | null;
  hasMoreQueue?: boolean;
  onLoadMoreQueue?: () => void;
  hasPreviousSegment?: boolean;
  hasNextSegment?: boolean;
  onPreviousSegment?: () => void;
  onNextSegment?: () => void;
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
  const intelligenceSegmentId = store.intelligenceSegmentId;
  const handleVisibleRangeChange = useCallback(
    (range: { visibleSegmentIds: string[]; loadSegmentIds: string[] }) =>
      store.ui.setSideBySideViewport(range),
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
  const totalSegments = pagination?.totalCount ?? (hasMoreQueue ? null : segments.length);
  const fileContext = store.fileContext;

  return (
    <ContentEditorSideBySideResizableLayout
      className={cn("bg-background", className)}
      intelligenceCollapsed={store.ui.detailsPanelCollapsed}
      onIntelligenceCollapsedChange={(collapsed) => store.ui.setDetailsPanelCollapsed(collapsed)}
      editor={
        <div className="@container flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          <SideBySideFileToolbar
            filename={fileContext.filename || fileContext.sourcePath}
            totalCount={totalSegments}
            position={segmentPosition}
            onPrevious={hasPreviousSegment ? onPreviousSegment : undefined}
            onNext={hasNextSegment ? onNextSegment : undefined}
          />
          <SideBySideColumnHeader
            sourceLocale={fileContext.sourceLocale}
            targetLocale={fileContext.targetLocale}
          />

          <div className="flex min-h-0 flex-1 flex-col">
            {isTranslationViewLoading && segments.length === 0 ? (
              <ContentEditorQueueSkeletonList className="px-4 py-3" />
            ) : segments.length === 0 ? (
              <div className="flex flex-1 items-center justify-center px-4 py-8 text-sm text-muted-foreground">
                <FormattedMessage {...emptyMessage} />
              </div>
            ) : (
              <ContentEditorSideBySideVirtualList
                segments={segments}
                focusedSegmentId={focusedSegmentId}
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
                isImageGenerating={isImageGenerating}
                generatingImageSegmentId={generatingImageSegmentId}
                canUseAiRecommendation={canUseAiRecommendation}
                focusedIntelligence={focusedIntelligence}
                aiRecommendationError={aiRecommendationError}
                formatChecks={formatChecks}
                segmentFormatChecks={segmentFormatChecks}
                formatCheckLoadingSegmentIds={formatCheckLoadingSegmentIds}
                primaryActionLabel={primaryActionLabel}
                segmentShareUrl={segmentShareUrl}
                onFocusSegment={onFocusSegment}
                onVisibleRangeChange={handleVisibleRangeChange}
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
          formatChecks={formatChecks}
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
